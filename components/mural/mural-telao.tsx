"use client";

import { AnimatePresence, motion } from 'framer-motion';
import QRCode from 'qrcode';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readStoredCode, timeAgo, type MuralPostView } from '@/components/mural/mural-client';

const PHOTO_SECONDS = 8;
const VIDEO_MAX_SECONDS = 30;
const REFRESH_MS = 15_000;

// Telão da festa: passa os posts do mural em tela cheia. Posts novos entram na frente da fila.
// Acesso: código de convite salvo neste aparelho ou o admin logado.
export function MuralTelao() {
  const [posts, setPosts] = useState<MuralPostView[]>([]);
  const [current, setCurrent] = useState<MuralPostView | null>(null);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [qr, setQr] = useState('');
  const [muralUrl, setMuralUrl] = useState('');
  const queue = useRef<string[]>([]);
  const seen = useRef(new Set<string>());
  const timer = useRef<number | null>(null);
  const postsRef = useRef<MuralPostView[]>([]);

  useEffect(() => {
    const url = `${window.location.origin}/mural`;
    setMuralUrl(url.replace(/^https?:\/\//, ''));
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#2f241b', light: '#fffaf1' } }).then(setQr).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const code = readStoredCode();
    try {
      const response = await fetch(`/api/mural${code ? `?code=${encodeURIComponent(code)}` : ''}`, { cache: 'no-store' });
      if (response.status === 401) {
        setNeedsAccess(true);
        return;
      }
      const data = await response.json();
      if (!response.ok) return;
      const next: MuralPostView[] = data.posts;
      // Posts que ainda não passaram no telão vão para a frente da fila.
      const fresh = next.filter((post) => !seen.current.has(post.id)).map((post) => post.id);
      queue.current = [...fresh.reverse(), ...queue.current.filter((id) => next.some((post) => post.id === id) && !fresh.includes(id))];
      fresh.forEach((id) => seen.current.add(id));
      postsRef.current = next;
      setPosts(next);
    } catch {
      // Sem conexão momentânea: mantém o que já está passando.
    }
  }, []);

  const showNext = useCallback(() => {
    const list = postsRef.current;
    if (list.length === 0) {
      setCurrent(null);
      return;
    }
    let id = queue.current.shift();
    if (!id) {
      // Fila vazia: recomeça com todos, dos mais novos para os mais antigos.
      queue.current = list.map((post) => post.id);
      id = queue.current.shift();
    }
    setCurrent(list.find((post) => post.id === id) ?? list[0]);
  }, []);

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [load]);

  // Começa a passar assim que houver posts.
  useEffect(() => {
    if (!current && posts.length > 0) showNext();
  }, [current, posts.length, showNext]);

  // Fotos ficam alguns segundos; vídeos tocam até o fim (no máximo 30 s).
  useEffect(() => {
    if (!current) return;
    if (timer.current) window.clearTimeout(timer.current);
    const seconds = current.mediaType === 'video' ? Math.min(VIDEO_MAX_SECONDS, (current.duration ?? VIDEO_MAX_SECONDS) + 0.5) : PHOTO_SECONDS;
    timer.current = window.setTimeout(showNext, seconds * 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [current, showNext]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  if (needsAccess) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-[#fffaf1]">
        <p className="font-display text-4xl italic">Telão do mural</p>
        <p className="max-w-md text-sm text-white/70">Para abrir o telão, entre no painel administrativo ou abra o mural com um código de convite neste aparelho.</p>
        <div className="flex gap-3">
          <Link href="/admin/login" className="rounded-full bg-champagne-600 px-6 py-3 text-xs font-medium uppercase tracking-[0.2em]">
            Entrar no admin
          </Link>
          <Link href="/mural" className="rounded-full border border-white/30 px-6 py-3 text-xs font-medium uppercase tracking-[0.2em]">
            Abrir o mural
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-[100svh] w-full cursor-none overflow-hidden bg-zinc-950 text-[#fffaf1]" onDoubleClick={toggleFullscreen}>
      <AnimatePresence mode="sync">
        {current ? (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {/* Fundo desfocado com a própria imagem, para fotos em pé não deixarem faixas pretas vazias. */}
            <img src={current.mediaType === 'video' ? current.posterUrl ?? current.thumbUrl : current.thumbUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
            <div className="absolute inset-0 flex items-center justify-center p-[3vh]">
              {current.mediaType === 'video' ? (
                <video key={current.id} src={current.fullUrl} poster={current.posterUrl ?? undefined} autoPlay muted playsInline onEnded={showNext} className="max-h-full max-w-full rounded-2xl shadow-2xl" />
              ) : (
                <img src={current.fullUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-[4vw] pb-[4vh] pt-[12vh]">
              <p className="font-display text-[clamp(1.6rem,3vw,3rem)] italic leading-tight">{current.authorName}</p>
              {current.caption ? <p className="mt-2 max-w-[60vw] text-[clamp(1rem,1.6vw,1.6rem)] text-white/90">{current.caption}</p> : null}
              <p className="mt-2 text-sm text-white/60">{timeAgo(current.createdAt)}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="vazio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
            <p className="font-display text-[clamp(2.5rem,6vw,5rem)] italic">Igor &amp; Bianca</p>
            <p className="text-[clamp(1rem,1.8vw,1.6rem)] text-white/70">Poste suas fotos e vídeos no mural: elas aparecem aqui!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {qr ? (
        <div className="absolute bottom-[4vh] right-[3vw] flex items-center gap-4 rounded-3xl bg-[#fffaf1] p-3 pr-6 text-zinc-800 shadow-2xl">
          <img src={qr} alt="QR Code para postar no mural" className="h-[clamp(5.5rem,11vw,9rem)] w-[clamp(5.5rem,11vw,9rem)]" />
          <div>
            <p className="text-[clamp(0.6rem,0.9vw,0.85rem)] font-medium uppercase tracking-[0.2em] text-zinc-800/70">Poste no mural</p>
            <p className="mt-1 font-display text-[clamp(1.1rem,1.8vw,1.8rem)] leading-tight">Aponte a câmera</p>
            <p className="mt-1 text-[clamp(0.7rem,0.9vw,0.9rem)] text-zinc-600">{muralUrl}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
