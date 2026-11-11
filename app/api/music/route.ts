import { NextResponse } from 'next/server';
import { DEFAULT_TRACK, MUSIC_PAGE_KEYS, getPublicMusic } from '@/lib/music';

export const dynamic = 'force-dynamic';

// O que cada página toca (usado pelo player do site).
export async function GET() {
  try {
    return NextResponse.json(await getPublicMusic(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Falha ao carregar as músicas', error);
    // Sem banco: o site segue com a música original em todas as páginas (como sempre foi).
    const fallback = { id: DEFAULT_TRACK.id, title: DEFAULT_TRACK.title, artist: null, url: DEFAULT_TRACK.url, start: 0 };
    return NextResponse.json({ mode: 'single', pages: Object.fromEntries(MUSIC_PAGE_KEYS.map((key) => [key, fallback])) });
  }
}
