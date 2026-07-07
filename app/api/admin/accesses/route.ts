import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequestAuthorized } from '@/lib/admin-auth';
import { db } from '@/lib/db';

type AccessSummaryRow = {
  invite_code_used: string;
  guest_name: string | null;
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
            attendance,
            dietary_notes,
            submitted_at
          FROM rsvp_responses
          ORDER BY UPPER(invite_code_used), submitted_at DESC
        )
        SELECT
          l.invite_code_used,
          COALESCE(i.guest_name, l.guest_name) AS guest_name,
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
