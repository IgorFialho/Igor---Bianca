import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ExistingRsvpRow = {
  id: string;
  invite_guest_name: string | null;
  responder_full_name: string | null;
  attendance: 'yes' | 'no';
  adults_count: number;
  children_count: number;
  dietary_notes: string | null;
  submitted_at: string;
  requires_children_details: boolean;
};

type RsvpChildRow = {
  full_name: string;
  age: number;
};

type ChildrenDetailInput = {
  fullName: string;
  age: number;
};

type PublicMessageRow = {
  id: string;
  guest_name: string | null;
  responder_full_name: string | null;
  invite_code_used: string;
  dietary_notes: string;
  submitted_at: string;
};

type InvitationCodeRow = {
  id: string;
  guest_name: string | null;
  requires_children_details: boolean;
};

function splitLinkedNames(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split('|')
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

function getExpectedResponderCount(guestName: string | null) {
  return splitLinkedNames(guestName).length === 2 ? 2 : 1;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const includeMessages = request.nextUrl.searchParams.get('messages') === 'yes';

  if (includeMessages) {
    try {
      const result = await db.query<PublicMessageRow>(
        `
          SELECT
            r.id::text,
            i.guest_name,
            r.responder_full_name,
            r.invite_code_used,
            r.dietary_notes,
            r.submitted_at::text
          FROM rsvp_responses r
          INNER JOIN invitation_codes i ON i.id = r.invitation_code_id
          WHERE r.attendance = 'yes'
            AND i.is_active = TRUE
            AND r.dietary_notes IS NOT NULL
            AND LENGTH(TRIM(r.dietary_notes)) > 0
          ORDER BY r.submitted_at DESC
          LIMIT 12
        `
      );

      const messages = result.rows.map((row: PublicMessageRow) => ({
        id: row.id,
        guestName: row.responder_full_name || row.guest_name || row.invite_code_used,
        message: row.dietary_notes,
        submittedAt: row.submitted_at,
      }));

      return NextResponse.json(
        { messages },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    } catch (error) {
      console.error('Falha ao consultar mensagens de RSVP', error);
      return NextResponse.json({ error: 'Erro ao consultar mensagens de RSVP.' }, { status: 500 });
    }
  }

  if (!code) {
    return NextResponse.json({
      submitted: false,
      requiresChildrenDetails: false,
      expectedResponderCount: 1,
    });
  }

  try {
    const result = await db.query<ExistingRsvpRow>(
      `
        SELECT
          r.id::text,
          i.guest_name AS invite_guest_name,
          r.responder_full_name,
          r.attendance,
          r.adults_count,
          r.children_count,
          r.dietary_notes,
          r.submitted_at::text,
          COALESCE(i.requires_children_details, FALSE) AS requires_children_details
        FROM rsvp_responses r
        LEFT JOIN invitation_codes i ON i.id = r.invitation_code_id
        WHERE UPPER(r.invite_code_used) = UPPER($1)
        ORDER BY submitted_at DESC
        LIMIT 1
      `,
      [code]
    );

    const existing = result.rows[0];

    if (!existing) {
      const inviteCodeResult = await db.query<InvitationCodeRow>(
        `
          SELECT id::text, requires_children_details
            , guest_name
          FROM invitation_codes
          WHERE UPPER(code) = UPPER($1)
          LIMIT 1
        `,
        [code]
      );

      return NextResponse.json({
        submitted: false,
        requiresChildrenDetails: Boolean(inviteCodeResult.rows[0]?.requires_children_details),
        expectedResponderCount: getExpectedResponderCount(inviteCodeResult.rows[0]?.guest_name || null),
      });
    }

    const childrenResult = await db.query<RsvpChildRow>(
      `
        SELECT full_name, age
        FROM rsvp_children
        WHERE rsvp_response_id = $1
        ORDER BY id ASC
      `,
      [existing.id]
    );

    return NextResponse.json({
      submitted: true,
      response: {
        attendance: existing.attendance,
        responder_full_name: existing.responder_full_name,
        expected_responder_count: getExpectedResponderCount(existing.invite_guest_name),
        adults_count: existing.adults_count,
        children_count: existing.children_count,
        dietary_notes: existing.dietary_notes,
        submitted_at: existing.submitted_at,
        requires_children_details: existing.requires_children_details,
        children: childrenResult.rows.map((row: RsvpChildRow) => ({
          fullName: row.full_name,
          age: row.age,
        })),
      },
    });
  } catch (error) {
    console.error('Falha ao consultar RSVP', error);
    return NextResponse.json({ error: 'Erro ao consultar status do RSVP.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : '';
    const responderFullName =
      typeof body?.responderFullName === 'string' ? body.responderFullName.trim() : '';
    const responderFullNamesRaw = Array.isArray(body?.responderFullNames)
      ? body.responderFullNames
      : [];
    const attendance = body?.attendance === 'yes' || body?.attendance === 'no' ? body.attendance : '';
    const adultsCount = Number.isFinite(Number(body?.adultsCount)) ? Number(body.adultsCount) : 1;
    const childrenCount = Number.isFinite(Number(body?.childrenCount)) ? Number(body.childrenCount) : 0;
    const dietaryNotes = typeof body?.dietaryNotes === 'string' ? body.dietaryNotes.trim() : null;
    const childrenDetailsRaw = Array.isArray(body?.childrenDetails) ? body.childrenDetails : [];

    if (!inviteCode) {
      return NextResponse.json({ error: 'Codigo do convite ausente.' }, { status: 400 });
    }

    if (!attendance) {
      return NextResponse.json({ error: 'Selecione a presenca.' }, { status: 400 });
    }

    const existingResult = await db.query<{ id: string }>(
      `
        SELECT id
        FROM rsvp_responses
        WHERE UPPER(invite_code_used) = UPPER($1)
        LIMIT 1
      `,
      [inviteCode]
    );

    if (existingResult.rows[0]) {
      return NextResponse.json({ error: 'RSVP ja confirmado para este convite.' }, { status: 409 });
    }

    const invitationCodeResult = await db.query<InvitationCodeRow>(
      `
        SELECT id::text, requires_children_details, guest_name
        FROM invitation_codes
        WHERE UPPER(code) = UPPER($1)
        LIMIT 1
      `,
      [inviteCode]
    );

    const invitationCodeId = invitationCodeResult.rows[0]?.id || null;
    const requiresChildrenDetails = Boolean(
      invitationCodeResult.rows[0]?.requires_children_details
    );
    const expectedResponderCount = getExpectedResponderCount(
      invitationCodeResult.rows[0]?.guest_name || null
    );

    const normalizedResponderFullNames = (responderFullNamesRaw.length > 0
      ? responderFullNamesRaw
      : responderFullName
        ? [responderFullName]
        : [])
      .filter((item: unknown) => typeof item === 'string')
      .map((item: unknown) => String(item).trim())
      .filter((item: string) => item.length > 0)
      .slice(0, expectedResponderCount);

    if (attendance === 'yes' && normalizedResponderFullNames.length !== expectedResponderCount) {
      return NextResponse.json(
        {
          error:
            expectedResponderCount === 2
              ? 'Informe o nome completo das duas pessoas para confirmar o convite.'
              : 'Informe seu nome completo para confirmar presenca.',
        },
        { status: 400 }
      );
    }

    if (
      attendance === 'yes' &&
      normalizedResponderFullNames.some((item: string) => item.length < 3)
    ) {
      return NextResponse.json(
        { error: 'Cada nome completo deve ter ao menos 3 caracteres.' },
        { status: 400 }
      );
    }

    const normalizedResponderFullName = normalizedResponderFullNames.join(' | ');

    if (normalizedResponderFullName.length > 180) {
      return NextResponse.json(
        { error: 'Nome completo muito longo. Use ate 180 caracteres.' },
        { status: 400 }
      );
    }

    const normalizedAdultsCount = Math.max(0, Math.min(10, Math.floor(adultsCount)));
    const normalizedChildrenCount =
      attendance === 'yes' ? Math.max(0, Math.min(10, Math.floor(childrenCount))) : 0;

    const normalizedChildrenDetails: ChildrenDetailInput[] = childrenDetailsRaw
      .map((item: unknown) => {
        const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const fullName = typeof source.fullName === 'string' ? source.fullName.trim() : '';
        const ageNumber = Number(source.age);

        return {
          fullName,
          age: Number.isFinite(ageNumber) ? Math.floor(ageNumber) : -1,
        };
      })
      .filter((item: ChildrenDetailInput) => item.fullName.length > 0)
      .slice(0, 10);

    const mustRequireChildrenDetails =
      requiresChildrenDetails && attendance === 'yes' && normalizedChildrenCount > 0;

    if (mustRequireChildrenDetails && normalizedChildrenDetails.length !== normalizedChildrenCount) {
      return NextResponse.json(
        {
          error:
            'Preencha nome completo e idade de todos os filhos informados para concluir o RSVP.',
        },
        { status: 400 }
      );
    }

    if (
      mustRequireChildrenDetails &&
      normalizedChildrenDetails.some(
        (item: ChildrenDetailInput) => item.age < 0 || item.age > 17
      )
    ) {
      return NextResponse.json(
        { error: 'A idade de cada filho deve estar entre 0 e 17 anos.' },
        { status: 400 }
      );
    }

    await db.query('BEGIN');

    try {
      const insertRsvpResult = await db.query<{ id: string }>(
        `
          INSERT INTO rsvp_responses (
            invitation_code_id,
            invite_code_used,
            responder_full_name,
            attendance,
            adults_count,
            children_count,
            dietary_notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id::text
        `,
        [
          invitationCodeId,
          inviteCode,
          attendance === 'yes' ? normalizedResponderFullName : null,
          attendance,
          normalizedAdultsCount,
          normalizedChildrenCount,
          dietaryNotes || null,
        ]
      );

      const rsvpResponseId = insertRsvpResult.rows[0]?.id;

      if (rsvpResponseId && normalizedChildrenCount > 0 && normalizedChildrenDetails.length > 0) {
        for (const child of normalizedChildrenDetails) {
          await db.query(
            `
              INSERT INTO rsvp_children (rsvp_response_id, full_name, age)
              VALUES ($1, $2, $3)
            `,
            [rsvpResponseId, child.fullName, child.age]
          );
        }
      }

      await db.query('COMMIT');
    } catch (transactionError) {
      await db.query('ROLLBACK');
      throw transactionError;
    }

    return NextResponse.json({ ok: true, locked: true });
  } catch (error) {
    console.error('Falha ao confirmar RSVP', error);
    return NextResponse.json({ error: 'Erro ao confirmar RSVP.' }, { status: 500 });
  }
}
