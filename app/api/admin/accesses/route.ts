import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';

type AccessSummaryRow = {
  invite_code_used: string;
  guest_name: string | null;
  responder_full_name: string | null;
  children_details: string | null;
  access_count: number;
  last_accessed_at: string;
  attendance: 'yes' | 'no' | null;
  dietary_notes: string | null;
};

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const result = await db.query<AccessSummaryRow>(
      `
        WITH latest_rsvp AS (
          SELECT DISTINCT ON (UPPER(invite_code_used))
            UPPER(invite_code_used) AS invite_code_used_upper,
            id AS rsvp_response_id,
            responder_full_name,
            attendance,
            dietary_notes,
            (
              SELECT string_agg(TRIM(c.full_name) || ' - ' || c.age::text || ' anos', E'\n' ORDER BY c.created_at, c.id)
              FROM rsvp_children c
              WHERE c.rsvp_response_id = r.id
            ) AS children_details,
            submitted_at
          FROM rsvp_responses r
          ORDER BY UPPER(invite_code_used), submitted_at DESC
        )
        SELECT
          l.invite_code_used,
          COALESCE(i.guest_name, l.guest_name) AS guest_name,
          MAX(r.responder_full_name) AS responder_full_name,
          MAX(r.children_details) AS children_details,
          COUNT(*)::int AS access_count,
          MAX(l.accessed_at) AS last_accessed_at,
          MAX(r.attendance) AS attendance,
          MAX(r.dietary_notes) AS dietary_notes
        FROM invite_access_logs l
        LEFT JOIN invitation_codes i ON i.id = l.invitation_code_id
        LEFT JOIN latest_rsvp r ON r.invite_code_used_upper = UPPER(l.invite_code_used)
        GROUP BY l.invite_code_used, COALESCE(i.guest_name, l.guest_name)
        ORDER BY MAX(l.accessed_at) DESC
        LIMIT 200
      `
    );

    return NextResponse.json({ accesses: result.rows });
  } catch (error) {
    console.error('Falha ao listar acessos', error);
    return NextResponse.json({ error: 'Erro ao buscar acessos.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    let inviteCodes: string[] = [];

    try {
      const body = await request.json();

      inviteCodes = Array.isArray(body?.inviteCodes)
        ? body.inviteCodes
            .filter((item: unknown) => typeof item === 'string')
            .map((item: string) => item.trim())
            .filter((item: string) => item.length > 0)
        : [];
    } catch {
      inviteCodes = [];
    }

    const normalizedCodes = Array.from(new Set(inviteCodes.map((item) => item.toUpperCase())));

    if (normalizedCodes.length > 0) {
      await db.query(
        `
          DELETE FROM invite_access_logs
          WHERE UPPER(invite_code_used) = ANY($1::text[])
        `,
        [normalizedCodes]
      );

      await db.query(
        `
          DELETE FROM rsvp_responses
          WHERE UPPER(invite_code_used) = ANY($1::text[])
        `,
        [normalizedCodes]
      );

      return NextResponse.json({ ok: true, deletedCodes: normalizedCodes });
    }

    await db.query('DELETE FROM invite_access_logs');
    await db.query('DELETE FROM rsvp_responses');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao limpar historico de acessos', error);
    return NextResponse.json({ error: 'Erro ao limpar historico de acessos.' }, { status: 500 });
  }
}
