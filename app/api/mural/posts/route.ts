import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { destroyMedia, verifyUploadResponse, type MediaKind } from '@/lib/cloudinary';
import {
  CAPTION_MAX_LENGTH,
  MAX_POSTS_PER_DAY,
  MAX_POSTS_PER_IP_PER_HOUR,
  POST_DELETE_WINDOW_SECONDS,
  cleanText,
  ensureMuralSchema,
  getMuralSettings,
  readAuthorName,
  readViewerId,
  requestIp,
  resolveGuest,
} from '@/lib/mural';

const toInt = (value: unknown) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : null);

// Publica um post depois que o arquivo já foi enviado ao Cloudinary. Mural aberto: basta o nome.
// A coluna invite_code guarda o identificador do aparelho de quem publicou (para "meus posts").
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    const name = readAuthorName(body?.name);
    if (!viewerId) {
      return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Informe o seu nome para publicar.' }, { status: 400 });
    }
    if (!(await getMuralSettings()).isOpen) {
      return NextResponse.json({ error: 'O mural ainda não está aberto para postagens.' }, { status: 403 });
    }

    const kind: MediaKind = body?.resourceType === 'video' ? 'video' : 'image';
    const publicId = typeof body?.publicId === 'string' ? body.publicId : '';
    const version = typeof body?.version === 'string' || typeof body?.version === 'number' ? body.version : '';
    const signature = typeof body?.signature === 'string' ? body.signature : '';
    // Só aceita arquivos que o Cloudinary confirma terem sido enviados à pasta do mural.
    if (!publicId || !verifyUploadResponse(publicId, version, signature)) {
      return NextResponse.json({ error: 'Envio inválido. Tente de novo.' }, { status: 400 });
    }

    await ensureMuralSchema();
    const ip = requestIp(request.headers);
    const limits = await db.query<{ by_device: number; by_ip: number }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE invite_code = $1 AND created_at > NOW() - INTERVAL '1 day')::int AS by_device,
          COUNT(*) FILTER (WHERE ip = $2 AND created_at > NOW() - INTERVAL '1 hour')::int AS by_ip
        FROM mural_posts
      `,
      [viewerId, ip]
    );
    if ((limits.rows[0]?.by_device ?? 0) >= MAX_POSTS_PER_DAY || (limits.rows[0]?.by_ip ?? 0) >= MAX_POSTS_PER_IP_PER_HOUR) {
      return NextResponse.json({ error: 'Muitas postagens seguidas. Tente de novo mais tarde.' }, { status: 429 });
    }

    // Se a pessoa também entrou com o código do convite, o post fica ligado ao convite (só para referência).
    const guest = body?.code ? await resolveGuest(body.code) : null;
    const caption = cleanText(body?.caption, CAPTION_MAX_LENGTH) || null;
    const duration = Number.isFinite(Number(body?.duration)) ? Number(body.duration) : null;
    const result = await db.query<{ id: string }>(
      `
        INSERT INTO mural_posts (invitation_code_id, invite_code, author_name, caption, media_type, public_id, width, height, duration, ip)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (public_id) DO NOTHING
        RETURNING id::text
      `,
      [guest?.id ?? null, viewerId, name, caption, kind, publicId, toInt(body?.width), toInt(body?.height), duration, ip]
    );
    return NextResponse.json({ ok: true, id: result.rows[0]?.id ?? null });
  } catch (error) {
    console.error('Falha ao publicar no mural', error);
    return NextResponse.json({ error: 'Erro ao publicar.' }, { status: 500 });
  }
}

// Quem publicou (o mesmo aparelho) pode apagar o próprio post só nos primeiros 2 minutos;
// depois disso, apenas o admin apaga (/api/admin/mural).
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const viewerId = readViewerId(body?.viewerId);
    if (!viewerId) {
      return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
    }
    await ensureMuralSchema();
    const postId = String(body?.postId ?? '');
    const result = await db.query<{ public_id: string; media_type: MediaKind }>(
      `
        DELETE FROM mural_posts
        WHERE id::text = $1 AND invite_code = $2 AND created_at > NOW() - make_interval(secs => $3)
        RETURNING public_id, media_type
      `,
      [postId, viewerId, POST_DELETE_WINDOW_SECONDS]
    );
    const removed = result.rows[0];
    if (!removed) {
      const mine = await db.query('SELECT 1 FROM mural_posts WHERE id::text = $1 AND invite_code = $2', [postId, viewerId]);
      return mine.rowCount
        ? NextResponse.json({ error: 'O prazo de 2 minutos para apagar terminou. Agora só os noivos podem apagar este post.' }, { status: 403 })
        : NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });
    }
    await destroyMedia(removed.media_type, removed.public_id).catch(() => false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao apagar post do mural', error);
    return NextResponse.json({ error: 'Erro ao apagar o post.' }, { status: 500 });
  }
}
