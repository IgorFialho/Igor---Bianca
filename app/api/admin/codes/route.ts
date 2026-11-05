import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { ensureRsvpSchema } from '@/lib/rsvp-schema';

type InviteCodeRow = {
  id: string;
  code: string;
  guest_name: string | null;
  phone: string | null;
  requires_children_details: boolean;
  is_active: boolean;
  created_at: string;
  rsvp_attendance?: 'yes' | 'no' | null;
  rsvp_responder_name?: string | null;
  rsvp_children_count?: number;
  rsvp_children_not_attending?: boolean;
  rsvp_children?: { fullName: string; age: number }[];
};

let phoneColumnReady: Promise<void> | null = null;

/** Telefone do convidado/casal: coluna criada na primeira vez que for usada (não altera dados existentes). */
function ensurePhoneColumn() {
  phoneColumnReady ??= db
    .query('ALTER TABLE invitation_codes ADD COLUMN IF NOT EXISTS phone VARCHAR(20)')
    .then(() => undefined)
    .catch((error) => {
      phoneColumnReady = null;
      throw error;
    });
  return phoneColumnReady;
}

/** Guarda só os dígitos do telefone (com DDD; aceita +55). Vazio = sem telefone. */
function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits.slice(0, 15) : null;
}

function generateCode() {
  return `IGB-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    await Promise.all([ensurePhoneColumn(), ensureRsvpSchema()]);
    // Cada código vem com a resposta mais recente do RSVP (para o relatório de convidados): presença,
    // nomes digitados por quem confirmou, quantidade de filhos e, quando informados, nome e idade de cada um.
    const result = await db.query<InviteCodeRow>(
      `
        SELECT
          i.id, i.code, i.guest_name, i.phone, i.requires_children_details, i.is_active, i.created_at,
          r.attendance AS rsvp_attendance,
          r.responder_full_name AS rsvp_responder_name,
          COALESCE(r.children_count, 0) AS rsvp_children_count,
          COALESCE(r.children_not_attending, FALSE) AS rsvp_children_not_attending,
          COALESCE(
            (
              SELECT json_agg(json_build_object('fullName', TRIM(c.full_name), 'age', c.age) ORDER BY c.created_at, c.id)
              FROM rsvp_children c
              WHERE c.rsvp_response_id = r.id
            ),
            '[]'::json
          ) AS rsvp_children
        FROM invitation_codes i
        LEFT JOIN LATERAL (
          SELECT id, attendance, children_count, responder_full_name, children_not_attending
          FROM rsvp_responses
          WHERE UPPER(invite_code_used) = UPPER(i.code)
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1
        ) r ON TRUE
        ORDER BY i.created_at DESC
        LIMIT 1000
      `
    );

    return NextResponse.json({ codes: result.rows });
  } catch (error) {
    console.error('Falha ao listar codigos', error);
    return NextResponse.json({ error: 'Erro ao buscar codigos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequestAuthorized(request))) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    await ensurePhoneColumn();
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
    // Telefone só vale quando a geração cria um único código (ex.: um casal).
    const phone = quantity === 1 ? normalizePhone(body?.phone) : null;
    if (phone && phone.length < 10) {
      return NextResponse.json({ error: 'Telefone incompleto: informe o DDD e o número.' }, { status: 400 });
    }

    const createdCodes: InviteCodeRow[] = [];
    let attempts = 0;

    while (createdCodes.length < quantity && attempts < quantity * 8) {
      attempts += 1;
      const code = generateCode();
      const guestNameForInsert = guests.length > 0 ? guests[createdCodes.length] : guestName;

      const insertResult = await db.query<InviteCodeRow>(
        `
          INSERT INTO invitation_codes (code, guest_name, requires_children_details, is_active, phone)
          VALUES ($1, $2, $3, TRUE, $4)
          ON CONFLICT (code) DO NOTHING
          RETURNING id, code, guest_name, phone, requires_children_details, is_active, created_at
        `,
        [code, guestNameForInsert || null, requiresChildrenDetails, phone]
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
  if (!(await isAdminRequestAuthorized(request))) {
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
  if (!(await isAdminRequestAuthorized(request))) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    await ensurePhoneColumn();
    const body = await request.json();
    const codeId = typeof body?.id === 'string' ? body.id.trim() : '';

    if (body?.action === 'edit') {
      if (!codeId) {
        return NextResponse.json({ error: 'ID do codigo e obrigatorio.' }, { status: 400 });
      }
      const names: string[] = Array.isArray(body?.names)
        ? body.names
            .filter((item: unknown) => typeof item === 'string')
            .map((item: string) => item.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim())
            .filter((item: string) => item.length > 0)
        : [];
      if (names.length === 0) {
        return NextResponse.json({ error: 'Informe pelo menos um nome.' }, { status: 400 });
      }
      // Um convite é de um convidado ou de um casal.
      if (names.length > 2) {
        return NextResponse.json({ error: 'Um convite pode ter no máximo duas pessoas (um casal).' }, { status: 400 });
      }
      const guestName = names.join(' | ');
      if (guestName.length > 150) {
        return NextResponse.json({ error: 'Os nomes ultrapassam 150 caracteres. Reduza e tente novamente.' }, { status: 400 });
      }
      const phone = normalizePhone(body?.phone);
      if (phone && phone.length < 10) {
        return NextResponse.json({ error: 'Telefone incompleto: informe o DDD e o número.' }, { status: 400 });
      }

      const editResult = await db.query<InviteCodeRow>(
        `
          UPDATE invitation_codes
          SET guest_name = $2, phone = $3
          WHERE id::text = $1
          RETURNING id, code, guest_name, phone, requires_children_details, is_active, created_at
        `,
        [codeId, guestName, phone]
      );
      if (!editResult.rows[0]) {
        return NextResponse.json({ error: 'Codigo nao encontrado.' }, { status: 404 });
      }
      return NextResponse.json({ updated: editResult.rows[0] });
    }

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
        RETURNING id, code, guest_name, phone, requires_children_details, is_active, created_at
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
