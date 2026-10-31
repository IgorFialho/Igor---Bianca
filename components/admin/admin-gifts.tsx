"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';

type AdminGift = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  store_url: string | null;
  is_active: boolean;
  created_at: string;
};

type AdminContribution = {
  id: string;
  gift_id: string;
  gift_title: string;
  price_cents: number;
  invite_code_used: string;
  guest_name: string | null;
  method: 'pix' | 'store';
  message: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
  confirmed_at: string | null;
};

const CARD = 'rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8';
const EYEBROW = 'text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70';
const FIELD =
  'w-full rounded-3xl border border-zinc-800/15 bg-cream px-5 py-3 text-sm text-zinc-800 placeholder:text-zinc-500 focus:border-champagne-600 focus:outline-none focus:ring-2 focus:ring-champagne-600/20';
const PRIMARY =
  'inline-flex items-center justify-center rounded-full bg-champagne-600 px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#fff9f1] transition-transform duration-500 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100';
const SMALL = 'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const STATUS_LABEL: Record<AdminContribution['status'], string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
};

const STATUS_CLASS: Record<AdminContribution['status'], string> = {
  pending: 'border-champagne-300 bg-[#f6edd7] text-zinc-800',
  confirmed: 'border-olive-300/70 bg-olive-50 text-olive-800',
  cancelled: 'border-zinc-800/15 bg-white text-zinc-500',
};

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNames(raw: string | null, fallback: string) {
  const names = (raw ?? '').split('|').map((item) => item.trim()).filter(Boolean);
  return names.length ? names.join(' e ') : fallback;
}

// Aba "Presentes" do painel: cadastro dos presentes e conferência de quem presenteou (o Pix cai direto na
// conta dos noivos, então a confirmação é manual, comparando com o extrato).
export function AdminGifts() {
  const [gifts, setGifts] = useState<AdminGift[]>([]);
  const [contributions, setContributions] = useState<AdminContribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', price: '', description: '', imageUrl: '', storeUrl: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/gifts', { cache: 'no-store' });
      if (response.status === 401) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao carregar presentes.');
      setGifts(data.gifts ?? []);
      setContributions(data.contributions ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar presentes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const request = async (method: 'PATCH' | 'DELETE', body: object, id: string) => {
    setBusyId(id);
    try {
      const response = await fetch('/api/admin/gifts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao atualizar.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro ao atualizar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFormMessage('');
    try {
      const response = await fetch('/api/admin/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Erro ao cadastrar.');
      setForm({ title: '', price: '', description: '', imageUrl: '', storeUrl: '' });
      setFormMessage('Presente cadastrado!');
      await load();
    } catch (createError) {
      setFormMessage(createError instanceof Error ? createError.message : 'Erro ao cadastrar.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeByGift = new Map(
    contributions.filter((item) => item.status !== 'cancelled').map((item) => [item.gift_id, item] as const)
  );
  const pendingCount = contributions.filter((item) => item.status === 'pending').length;
  const confirmedTotal = contributions
    .filter((item) => item.status === 'confirmed')
    .reduce((total, item) => total + item.price_cents, 0);

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={EYEBROW}>Lista de presentes</p>
          <h2 className="mt-2 font-display text-4xl leading-none text-zinc-800">Presentes</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-zinc-700">
          <span className="rounded-full bg-[#f6edd7] px-4 py-2">{pendingCount} aguardando confirmação</span>
          <span className="rounded-full bg-olive-50 px-4 py-2 text-olive-800">{formatPrice(confirmedTotal)} confirmados</span>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={handleCreate} className="space-y-4">
          <p className={EYEBROW}>Cadastrar presente</p>
          <input className={FIELD} placeholder="Nome do presente *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={FIELD} placeholder="Valor (ex.: 299,90) *" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <textarea className={FIELD} rows={2} placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className={FIELD} placeholder="Link da imagem (opcional)" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <input className={FIELD} placeholder="Link da loja (opcional, para comprar o produto)" value={form.storeUrl} onChange={(e) => setForm({ ...form, storeUrl: e.target.value })} />
          <button type="submit" disabled={isSaving} className={`${PRIMARY} w-full`}>
            {isSaving ? 'Salvando…' : 'Adicionar presente'}
          </button>
          {formMessage ? <p className="text-sm text-zinc-700">{formMessage}</p> : null}
        </form>

        <div className="space-y-3">
          <p className={EYEBROW}>Presentes cadastrados ({gifts.length})</p>
          {isLoading ? <p className="text-sm text-zinc-600">Carregando…</p> : null}
          {!isLoading && gifts.length === 0 ? <p className="text-sm text-zinc-600">Nenhum presente cadastrado ainda.</p> : null}
          <div className="max-h-[26rem] space-y-3 overflow-auto pr-1">
            {gifts.map((gift) => {
              const taken = activeByGift.get(gift.id);
              return (
                <article key={gift.id} className="flex items-center gap-4 rounded-2xl border border-zinc-800/10 bg-cream p-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f6edd7]">
                    {gift.image_url ? <img src={gift.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl">🎁</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-800">{gift.title}</p>
                    <p className="text-sm text-zinc-600">
                      {formatPrice(gift.price_cents)}
                      {taken ? ` · ${STATUS_LABEL[taken.status]}` : ''}
                      {!gift.is_active ? ' · oculto' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={busyId === gift.id}
                      onClick={() => request('PATCH', { action: 'toggle', giftId: gift.id, isActive: !gift.is_active }, gift.id)}
                      className={`${SMALL} border-zinc-800/20 text-zinc-800 hover:bg-zinc-800/5`}
                    >
                      {gift.is_active ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === gift.id}
                      onClick={() => {
                        if (window.confirm(`Excluir "${gift.title}"? O histórico de quem o escolheu também será apagado.`)) {
                          void request('DELETE', { giftId: gift.id }, gift.id);
                        }
                      }}
                      className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <p className={EYEBROW}>Quem presenteou</p>
        <p className="mt-2 text-sm text-zinc-600">
          Pix: confira no extrato (a referência aparece como PRESENTE + número do presente) e confirme. Cancelar
          libera o presente na lista.
        </p>
        <div className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-zinc-800/10 bg-cream">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#f6edd7] text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-800/70">
              <tr>
                <th className="px-4 py-3">Presente</th>
                <th className="px-4 py-3">Convidado</th>
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Recado</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((item) => (
                <tr key={item.id} className="border-t border-zinc-800/10 align-top text-zinc-700">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-800">{item.gift_title}</p>
                    <p className="text-xs text-zinc-500">{formatPrice(item.price_cents)} · {new Date(item.created_at).toLocaleString('pt-BR')}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{formatNames(item.guest_name, item.invite_code_used)}</p>
                    <p className="text-xs text-zinc-500">{item.invite_code_used}</p>
                  </td>
                  <td className="px-4 py-3">{item.method === 'pix' ? 'Pix' : 'Comprou na loja'}</td>
                  <td className="max-w-[16rem] px-4 py-3 [overflow-wrap:anywhere]">{item.message || <span className="text-zinc-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {item.status !== 'confirmed' ? (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => request('PATCH', { action: 'contribution', contributionId: item.id, status: 'confirmed' }, item.id)}
                          className={`${SMALL} border-olive-300 bg-olive-50 text-olive-800 hover:bg-olive-100`}
                        >
                          Confirmar
                        </button>
                      ) : null}
                      {item.status !== 'cancelled' ? (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => request('PATCH', { action: 'contribution', contributionId: item.id, status: 'cancelled' }, item.id)}
                          className={`${SMALL} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && contributions.length === 0 ? <p className="p-4 text-sm text-zinc-600">Ninguém presenteou ainda.</p> : null}
        </div>
      </div>
    </section>
  );
}
