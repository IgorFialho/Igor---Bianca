"use client";

import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/confirm-dialog';
import { timeAgo, type MuralPostView, type MuralSettingsView } from '@/components/mural/mural-client';

const CARD = 'rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8';
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const FIELD =
  'w-full rounded-xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const BUTTON = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-60';
// No iPhone o campo de data tem largura mínima própria e estoura o card: força caber e alinha o texto à esquerda.
const DATE_FIELD = `${FIELD} block min-w-0 max-w-full appearance-none min-h-[46px] text-left [&::-webkit-date-and-time-value]:text-left`;
const PRIMARY = `${BUTTON} bg-champagne-600 text-[#fff9f1] hover:opacity-90`;
const SECONDARY = `${BUTTON} border border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`;
const DANGER = `${BUTTON} border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`;
const SMALL = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors';

type AdminComment = { id: string; postId: string; authorName: string; text: string; isHidden: boolean; createdAt: string };

/** ISO → valor do campo datetime-local (horário do aparelho). */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Aba "Mural" do painel: abrir/fechar/agendar a postagem, moderar posts e comentários e baixar tudo.
export function AdminMural() {
  const [settings, setSettings] = useState<MuralSettingsView | null>(null);
  const [posts, setPosts] = useState<MuralPostView[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [opensAtInput, setOpensAtInput] = useState('');
  const [closesAtInput, setClosesAtInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null);
  const closeConfirm = useCallback(() => setConfirmAction(null), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/mural', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao carregar o mural.');
      setSettings(data.settings);
      setPosts(data.posts);
      setComments(data.comments);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o mural.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setOpensAtInput(toLocalInput(settings?.opensAt ?? null));
  }, [settings?.opensAt]);

  useEffect(() => {
    setClosesAtInput(toLocalInput(settings?.closesAt ?? null));
  }, [settings?.closesAt]);

  const request = async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/mural', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir.');
    return data;
  };

  const saveSettings = async (manualOpen: boolean, opensAt: string, closesAt: string, done: string) => {
    setIsSaving(true);
    setError('');
    try {
      const data = await request('PATCH', {
        action: 'settings',
        manualOpen,
        opensAt: opensAt ? new Date(opensAt).toISOString() : '',
        closesAt: closesAt ? new Date(closesAt).toISOString() : '',
      });
      setSettings(data.settings);
      setMessage(done);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError('');
    try {
      await action();
      setMessage(done);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir.');
    }
  };

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const photos = posts.filter((post) => post.mediaType === 'image').length;
  const videos = posts.length - photos;
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const postById = new Map(posts.map((post) => [post.id, post]));
  const formatDateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const opensAtLabel = formatDateTime(settings?.opensAt);
  const closesAtLabel = formatDateTime(settings?.closesAt);
  const closeNote = closesAtLabel && !settings?.isClosedBySchedule ? ` Fecha automaticamente em ${closesAtLabel}.` : '';

  const stats = [
    { label: 'Posts', value: posts.length },
    { label: 'Fotos', value: photos },
    { label: 'Vídeos', value: videos },
    { label: 'Curtidas', value: totalLikes },
    { label: 'Comentários', value: comments.length },
  ];

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl leading-none text-zinc-800">Mural do casamento</h2>
          <p className="mt-2 text-sm text-zinc-600">Fotos e vídeos que os convidados postam. Aparecem na hora; aqui vocês ocultam ou excluem.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/mural" target="_blank" rel="noopener noreferrer" className={SECONDARY}>
            Abrir o mural
          </a>
          <a href="/mural/telao" target="_blank" rel="noopener noreferrer" className={SECONDARY}>
            Abrir o telão
          </a>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-olive-800">{message}</p> : null}
      {isLoading ? <p className="mt-6 text-sm text-zinc-600">Carregando…</p> : null}

      {settings ? (
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5 rounded-2xl border border-zinc-800/10 bg-cream p-5">
            <div className="flex items-center justify-between gap-3">
              <p className={EYEBROW}>Postagem</p>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  settings.isOpen ? 'border-olive-300/70 bg-olive-50 text-olive-800' : 'border-zinc-800/15 bg-[#f6edd7] text-zinc-700'
                }`}
              >
                {settings.isOpen ? 'Aberta' : 'Fechada'}
              </span>
            </div>
            <p className="text-sm text-zinc-700">
              {settings.isClosedBySchedule
                ? `Encerrada automaticamente em ${closesAtLabel}. Os convidados veem o mural, mas não postam mais.`
                : settings.isOpen
                  ? (settings.manualOpen ? 'Aberta pelo botão: os convidados já podem postar, curtir e comentar.' : `Abriu automaticamente em ${opensAtLabel}.`) + closeNote
                  : opensAtLabel
                    ? `Abre automaticamente em ${opensAtLabel}.` + closeNote
                    : 'Fechada: os convidados veem o mural, mas não postam.'}
            </p>
            {!settings.uploadsReady ? <p className="text-xs text-rose-700">Cloudinary não configurado neste ambiente: o envio de arquivos não funciona.</p> : null}

            <div className="flex flex-wrap gap-2">
              {settings.isOpen ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    setConfirmAction({
                      title: 'Fechar o mural',
                      message: 'Os convidados deixam de postar, curtir e comentar (o que já foi postado continua visível). Os horários agendados de abrir e fechar também são removidos.',
                      confirmLabel: 'Fechar',
                      tone: 'danger',
                      onConfirm: () => saveSettings(false, '', '', 'Mural fechado.'),
                    })
                  }
                  className={DANGER}
                >
                  Fechar agora
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    setConfirmAction({
                      title: 'Abrir o mural',
                      message: 'Os convidados passam a poder postar fotos e vídeos, curtir e comentar.',
                      confirmLabel: 'Abrir',
                      onConfirm: () => saveSettings(true, opensAtInput, closesAtInput, 'Mural aberto.'),
                    })
                  }
                  className={PRIMARY}
                >
                  Abrir agora
                </button>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-800/10 pt-5">
              <p className={EYEBROW}>Agendamento</p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="mural-opens-at" className="text-xs text-zinc-600">
                    Abrir automaticamente em
                  </label>
                  <input id="mural-opens-at" type="datetime-local" value={opensAtInput} onChange={(event) => setOpensAtInput(event.target.value)} className={DATE_FIELD} />
                  {opensAtInput ? (
                    <button type="button" onClick={() => setOpensAtInput('')} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                      limpar
                    </button>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="mural-closes-at" className="text-xs text-zinc-600">
                    Fechar automaticamente em
                  </label>
                  <input id="mural-closes-at" type="datetime-local" value={closesAtInput} min={opensAtInput || undefined} onChange={(event) => setClosesAtInput(event.target.value)} className={DATE_FIELD} />
                  {closesAtInput ? (
                    <button type="button" onClick={() => setClosesAtInput('')} className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                      limpar
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-zinc-600">Ao fechar, os posts continuam visíveis, mas ninguém mais posta, curte ou comenta.</p>
              <button
                type="button"
                disabled={isSaving || (opensAtInput === toLocalInput(settings.opensAt) && closesAtInput === toLocalInput(settings.closesAt))}
                onClick={() =>
                  saveSettings(
                    settings.manualOpen,
                    opensAtInput,
                    closesAtInput,
                    opensAtInput || closesAtInput ? 'Agendamento salvo.' : 'Agendamento removido.'
                  )
                }
                className={SECONDARY}
              >
                Salvar agendamento
              </button>
            </div>

            <div className="space-y-2 border-t border-zinc-800/10 pt-5">
              <p className={EYEBROW}>Baixar tudo</p>
              <p className="text-xs text-zinc-600">Gera um arquivo .zip com os arquivos originais enviados ao mural (inclusive os ocultos).</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/admin/mural/download?type=image" className={`${SECONDARY} ${photos === 0 ? 'pointer-events-none opacity-50' : ''}`}>
                  Fotos (.zip)
                </a>
                <a href="/api/admin/mural/download?type=video" className={`${SECONDARY} ${videos === 0 ? 'pointer-events-none opacity-50' : ''}`}>
                  Vídeos (.zip)
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-zinc-800/10 bg-cream px-4 py-3">
                  <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-zinc-800/70">{stat.label}</p>
                  <p className="mt-1 font-display text-3xl leading-none tabular-nums text-zinc-800">{stat.value}</p>
                </div>
              ))}
            </div>

            <p className={EYEBROW}>Posts</p>
            {posts.length === 0 ? <p className="text-sm text-zinc-600">Nenhum post ainda.</p> : null}
            <div className="safari-clip overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
              <div className="scroll-pill max-h-[30rem] space-y-0 overflow-auto">
                {posts.map((post) => (
                  <div key={post.id} className={`flex items-center gap-3 border-b border-zinc-800/10 p-3 last:border-b-0 ${post.isHidden ? 'opacity-60' : ''}`}>
                    <a href={post.fullUrl} target="_blank" rel="noopener noreferrer" className="safari-clip relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f6edd7]">
                      <img src={post.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {post.mediaType === 'video' ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[0.6rem] text-white">vídeo</span> : null}
                    </a>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium text-zinc-800">{post.authorName}</p>
                      {post.caption ? <p className="truncate text-xs text-zinc-600">{post.caption}</p> : null}
                      <p className="text-xs text-zinc-500">
                        {timeAgo(post.createdAt)} · {post.likes} {post.likes === 1 ? "curtida" : "curtidas"} · {post.comments} coment.{post.isHidden ? ' · oculto' : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => run(() => request('PATCH', { action: 'post', id: post.id, hidden: !post.isHidden }), post.isHidden ? 'Post visível de novo.' : 'Post ocultado.')}
                        className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                      >
                        {post.isHidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            eyebrow: 'Confirmar exclusão',
                            title: 'Excluir post',
                            message: <>Excluir o post de <strong className="text-zinc-900">{post.authorName}</strong>? O arquivo é apagado do Cloudinary, junto com curtidas e comentários. Esta ação não pode ser desfeita.</>,
                            confirmLabel: 'Excluir',
                            tone: 'danger',
                            onConfirm: () => run(() => request('DELETE', { postId: post.id }), 'Post excluído.'),
                          })
                        }
                        className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className={EYEBROW}>Comentários</p>
            {comments.length === 0 ? <p className="text-sm text-zinc-600">Nenhum comentário ainda.</p> : null}
            {comments.length > 0 ? (
              <div className="safari-clip overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
                <div className="scroll-pill max-h-[24rem] overflow-auto">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`flex items-start gap-3 border-b border-zinc-800/10 p-3 last:border-b-0 ${comment.isHidden ? 'opacity-60' : ''}`}>
                      {postById.get(comment.postId) ? (
                        <img src={postById.get(comment.postId)?.thumbUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="break-words text-zinc-800">
                          <span className="font-medium">{comment.authorName}</span> {comment.text}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {timeAgo(comment.createdAt)}
                          {comment.isHidden ? ' · oculto' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => run(() => request('PATCH', { action: 'comment', id: comment.id, hidden: !comment.isHidden }), comment.isHidden ? 'Comentário visível de novo.' : 'Comentário ocultado.')}
                          className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                        >
                          {comment.isHidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              eyebrow: 'Confirmar exclusão',
                              title: 'Excluir comentário',
                              message: <>Excluir o comentário de <strong className="text-zinc-900">{comment.authorName}</strong>?</>,
                              confirmLabel: 'Excluir',
                              tone: 'danger',
                              onConfirm: () => run(() => request('DELETE', { commentId: comment.id }), 'Comentário excluído.'),
                            })
                          }
                          className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog request={confirmAction} onClose={closeConfirm} />
    </section>
  );
}
