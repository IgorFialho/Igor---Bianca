import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type ExistingRsvpRow = {
  attendance: 'yes' | 'no';
  adults_count: number;
  children_count: number;
  dietary_notes: string | null;
  submitted_at: string;
};

type InvitationCodeRow = {
  id: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();

  if (!code) {
    return NextResponse.json({ submitted: false });
  }

  try {
    const result = await db.query<ExistingRsvpRow>(
      `
        SELECT attendance, adults_count, children_count, dietary_notes, submitted_at
        FROM rsvp_responses
        WHERE UPPER(invite_code_used) = UPPER($1)
        ORDER BY submitted_at DESC
        LIMIT 1
      `,
      [code]
    );

    const existing = result.rows[0];

    if (!existing) {
      return NextResponse.json({ submitted: false });
    }

    return NextResponse.json({ submitted: true, response: existing });
  } catch (error) {
    console.error('Falha ao consultar RSVP', error);
    return NextResponse.json({ error: 'Erro ao consultar status do RSVP.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inviteCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : '';
    const attendance = body?.attendance === 'yes' || body?.attendance === 'no' ? body.attendance : '';
    const adultsCount = Number.isFinite(Number(body?.adultsCount)) ? Number(body.adultsCount) : 1;
    const childrenCount = Number.isFinite(Number(body?.childrenCount)) ? Number(body.childrenCount) : 0;
    const dietaryNotes = typeof body?.dietaryNotes === 'string' ? body.dietaryNotes.trim() : null;

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
        SELECT id
        FROM invitation_codes
        WHERE UPPER(code) = UPPER($1)
        LIMIT 1
      `,
      [inviteCode]
    );

    const invitationCodeId = invitationCodeResult.rows[0]?.id || null;

    await db.query(
      `
        INSERT INTO rsvp_responses (
          invitation_code_id,
          invite_code_used,
          attendance,
          adults_count,
          children_count,
          dietary_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        invitationCodeId,
        inviteCode,
        attendance,
        Math.max(0, Math.min(10, Math.floor(adultsCount))),
        Math.max(0, Math.min(10, Math.floor(childrenCount))),
        dietaryNotes || null,
      ]
    );

    return NextResponse.json({ ok: true, locked: true });
  } catch (error) {
    console.error('Falha ao confirmar RSVP', error);
    return NextResponse.json({ error: 'Erro ao confirmar RSVP.' }, { status: 500 });
  }
}
