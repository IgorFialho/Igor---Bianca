import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';

type InviteCodeRow = {
  id: string;
  code: string;
  guest_name: string | null;
  requires_children_details: boolean;
  is_active: boolean;
  created_at: string;
};

function generateCode() {
  return `IGB-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const result = await db.query<InviteCodeRow>(
      `
        SELECT id, code, guest_name, requires_children_details, is_active, created_at
        FROM invitation_codes
        ORDER BY created_at DESC
        LIMIT 200
      `
    );

    return NextResponse.json({ codes: result.rows });
  } catch (error) {
    console.error('Falha ao listar codigos', error);
    return NextResponse.json({ error: 'Erro ao buscar codigos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const guests = Array.isArray(body?.guests)
      ? body.guests
          .filter((item: unknown) => typeof item === 'string')
          .map((item: string) => item.trim())
          .filter((item: string) => item.length > 0)
          .slice(0, 100)
      : [];

    const guestNameLines = typeof body?.guestName === 'string'
      ? body.guestName
          .split(/\r?\n/)
          .map((item: string) => item.trim())
          .filter((item: string) => item.length > 0)
      : [];
    const hasLinkedGuestNames = guestNameLines.length > 1;
    const guestName = guestNameLines.length > 0 ? guestNameLines.join(' | ') : null;

    if (guestName && guestName.length > 150) {
      return NextResponse.json(
        {
          error:
            "O campo de nomes vinculados ultrapassa 150 caracteres. Reduza os nomes e tente novamente.",
        },
        { status: 400 }
      );
    }

    const quantityRaw = Number(body?.quantity ?? 1);
    const fallbackQuantity = Number.isFinite(quantityRaw)
      ? Math.max(1, Math.min(50, Math.floor(quantityRaw)))
      : 1;
    const quantity = guests.length > 0 ? guests.length : hasLinkedGuestNames ? 1 : fallbackQuantity;
    const requiresChildrenDetails = Boolean(body?.requiresChildrenDetails);

    const createdCodes: InviteCodeRow[] = [];
    let attempts = 0;

    while (createdCodes.length < quantity && attempts < quantity * 8) {
      attempts += 1;
      const code = generateCode();
      const guestNameForInsert = guests.length > 0 ? guests[createdCodes.length] : guestName;

      const insertResult = await db.query<InviteCodeRow>(
        `
          INSERT INTO invitation_codes (code, guest_name, requires_children_details, is_active)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (code) DO NOTHING
          RETURNING id, code, guest_name, requires_children_details, is_active, created_at
        `,
        [code, guestNameForInsert || null, requiresChildrenDetails]
      );

      if (insertResult.rows[0]) {
        createdCodes.push(insertResult.rows[0]);
      }
    }

    return NextResponse.json({
      generated: createdCodes,
      requested: quantity,
      mode: guests.length > 0 ? 'by_guests' : hasLinkedGuestNames ? 'single_linked_names' : 'basic',
    });
  } catch (error) {
    console.error('Falha ao gerar codigos', error);
    return NextResponse.json({ error: 'Erro ao gerar codigos.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const codeId = typeof body?.id === 'string' ? body.id.trim() : '';
    const codeIds = Array.isArray(body?.ids)
      ? body.ids
          .filter((item: unknown) => typeof item === 'string')
          .map((item: string) => item.trim())
          .filter((item: string) => item.length > 0)
      : [];

    const idsToDelete = codeIds.length > 0 ? codeIds : codeId ? [codeId] : [];

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'ID do codigo e obrigatorio.' }, { status: 400 });
    }

    const codeRowsResult = await db.query<{ id: string; code: string }>(
      `
        SELECT id::text, code
        FROM invitation_codes
        WHERE id::text = ANY($1::text[])
      `,
      [idsToDelete]
    );

    if (codeRowsResult.rows.length === 0) {
      return NextResponse.json({ error: 'Codigo nao encontrado.' }, { status: 404 });
    }

    const idsFound = codeRowsResult.rows.map((item: { id: string; code: string }) => item.id);
    const codesFound = codeRowsResult.rows.map((item: { id: string; code: string }) => item.code);

    await db.query(
      `
        DELETE FROM rsvp_responses
        WHERE invitation_code_id::text = ANY($1::text[])
           OR UPPER(invite_code_used) = ANY(
             SELECT UPPER(value)
             FROM UNNEST($2::text[]) AS value
           )
      `,
      [idsFound, codesFound]
    );

    await db.query(
      `
        DELETE FROM invite_access_logs
        WHERE invitation_code_id::text = ANY($1::text[])
           OR UPPER(invite_code_used) = ANY(
             SELECT UPPER(value)
             FROM UNNEST($2::text[]) AS value
           )
      `,
      [idsFound, codesFound]
    );

    const deleteResult = await db.query<InviteCodeRow>(
      `
        DELETE FROM invitation_codes
        WHERE id::text = ANY($1::text[])
        RETURNING id, code, guest_name, is_active, created_at
      `,
      [idsFound]
    );

    return NextResponse.json({
      deleted: deleteResult.rows,
      deletedCount: deleteResult.rows.length,
    });
  } catch (error) {
    console.error('Falha ao excluir codigo', error);
    return NextResponse.json({ error: 'Erro ao excluir codigo.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const codeId = typeof body?.id === 'string' ? body.id.trim() : '';
    const requiresChildrenDetails =
      typeof body?.requiresChildrenDetails === 'boolean' ? body.requiresChildrenDetails : null;

    if (!codeId) {
      return NextResponse.json({ error: 'ID do codigo e obrigatorio.' }, { status: 400 });
    }

    if (requiresChildrenDetails === null) {
      return NextResponse.json(
        { error: 'Valor de configuracao de filhos e obrigatorio.' },
        { status: 400 }
      );
    }

    const updateResult = await db.query<InviteCodeRow>(
      `
        UPDATE invitation_codes
        SET requires_children_details = $2
        WHERE id::text = $1
        RETURNING id, code, guest_name, requires_children_details, is_active, created_at
      `,
      [codeId, requiresChildrenDetails]
    );

    if (!updateResult.rows[0]) {
      return NextResponse.json({ error: 'Codigo nao encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ updated: updateResult.rows[0] });
  } catch (error) {
    console.error('Falha ao atualizar configuracao de filhos do codigo', error);
    return NextResponse.json({ error: 'Erro ao atualizar codigo.' }, { status: 500 });
  }
}
