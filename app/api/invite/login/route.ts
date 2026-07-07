import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

type InviteCodeRow = {
  id: string;
  code: string;
  guest_name: string | null;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');

  if (!forwardedFor) {
    return null;
  }

  return forwardedFor.split(',')[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawCode = typeof body?.code === 'string' ? body.code : '';
    const code = rawCode.trim();

    if (!code) {
      return NextResponse.json({ error: 'Informe o codigo do convite.' }, { status: 400 });
    }

    const result = await db.query<InviteCodeRow>(
      `
        SELECT id, code, guest_name
        FROM invitation_codes
        WHERE UPPER(code) = UPPER($1)
          AND is_active = TRUE
        LIMIT 1
      `,
      [code]
    );

    const inviteCode = result.rows[0];

    if (!inviteCode) {
      return NextResponse.json({ error: 'Codigo invalido.' }, { status: 401 });
    }

    const userAgent = request.headers.get('user-agent');
    const ipAddress = getClientIp(request);

    await db.query(
      `
        INSERT INTO invite_access_logs (invitation_code_id, invite_code_used, guest_name, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [inviteCode.id, inviteCode.code, inviteCode.guest_name, ipAddress, userAgent]
    );

    return NextResponse.json({
      ok: true,
      code: inviteCode.code,
      guestName: inviteCode.guest_name,
    });
  } catch (error) {
    console.error('Falha no login de convite', error);
    return NextResponse.json({ error: 'Erro interno ao validar convite.' }, { status: 500 });
  }
}
