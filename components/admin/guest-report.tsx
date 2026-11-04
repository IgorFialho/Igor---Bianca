"use client";

import { useMemo, useState } from 'react';
import { SearchField, type SearchFilterOption } from '@/components/admin/search-field';

type ReportCode = { id: string; code: string; guest_name: string | null };
type ReportAccess = { invite_code_used: string; attendance: 'yes' | 'no' | null };

type ResponseStatus = 'yes' | 'no' | 'pending';
type ResponseFilter = 'all' | ResponseStatus;

type GuestRow = {
  key: string;
  name: string;
  code: string;
  companions: string[];
  isCouple: boolean;
  response: ResponseStatus;
};

const RESPONSE_FILTERS: SearchFilterOption<ResponseFilter>[] = [
  { id: 'all', label: 'Todos' },
  { id: 'yes', label: 'Confirmaram' },
  { id: 'no', label: 'Recusaram' },
  { id: 'pending', label: 'Sem resposta' },
];

const RESPONSE_BADGE: Record<ResponseStatus, { label: string; className: string }> = {
  yes: { label: 'Confirmou', className: 'border-olive-300/70 bg-olive-50 text-olive-800' },
  no: { label: 'Recusou', className: 'border-rose-300/70 bg-rose-50 text-rose-800' },
  pending: { label: 'Sem resposta', className: 'border-zinc-800/15 bg-[#f6edd7] text-zinc-700' },
};

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const splitNames = (raw: string | null) =>
  (raw ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Relatório da lista de convidados: um nome por linha (casais viram duas linhas, ligadas pelo mesmo código).
// É calculado a partir dos códigos e respostas que o painel já carregou, então acompanha cada mudança na hora.
export function GuestReport({ codes, accesses, isLoading }: { codes: ReportCode[]; accesses: ReportAccess[]; isLoading: boolean }) {
  const [search, setSearch] = useState('');
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>('all');

  const { rows, unnamedCodes } = useMemo(() => {
    const responseByCode = new Map<string, ResponseStatus>();
    for (const access of accesses) {
      if (access.attendance) responseByCode.set(access.invite_code_used.toUpperCase(), access.attendance);
    }

    const list: GuestRow[] = [];
    let unnamed = 0;
    for (const code of codes) {
      const names = splitNames(code.guest_name);
      if (names.length === 0) {
        unnamed += 1;
        continue;
      }
      const response = responseByCode.get(code.code.toUpperCase()) ?? 'pending';
      names.forEach((name, index) => {
        list.push({
          key: `${code.id}-${index}`,
          name,
          code: code.code,
          companions: names.filter((_, other) => other !== index),
          isCouple: names.length > 1,
          response,
        });
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    return { rows: list, unnamedCodes: unnamed };
  }, [codes, accesses]);

  const query = normalize(search.trim());
  const filteredRows = rows.filter((row) => {
    if (responseFilter !== 'all' && row.response !== responseFilter) return false;
    return !query || normalize(`${row.name} ${row.code} ${row.companions.join(' ')}`).includes(query);
  });
  const isFiltering = query !== '' || responseFilter !== 'all';

  const confirmed = rows.filter((row) => row.response === 'yes').length;
  const declined = rows.filter((row) => row.response === 'no').length;
  const pending = rows.length - confirmed - declined;
  const invites = codes.length - unnamedCodes;

  const stats = [
    { label: 'Convidados na lista', value: rows.length, highlight: true },
    { label: 'Convites', value: invites },
    { label: 'Confirmaram', value: confirmed },
    { label: 'Recusaram', value: declined },
    { label: 'Sem resposta', value: pending },
  ];

  return (
    <section className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl leading-none text-zinc-800">Relatório de convidados</h2>
          <p className="mt-2 text-sm text-zinc-600">Todos os nomes cadastrados, atualizado em tempo real.</p>
        </div>
      </div>

      {/* No celular o total ocupa a linha inteira e os outros 4 ficam em duas colunas; no computador, 5 lado a lado. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl border px-5 py-4 ${stat.highlight ? 'col-span-2 lg:col-span-1' : ''} ${
              stat.highlight ? 'border-champagne-600/30 bg-champagne-600 text-[#fff9f1]' : 'border-zinc-800/10 bg-cream text-zinc-800'
            }`}
          >
            <p className={`text-[0.68rem] font-medium uppercase tracking-[0.18em] ${stat.highlight ? 'text-[#fff9f1]/80' : 'text-zinc-800/70'}`}>
              {stat.label}
            </p>
            <p className="mt-1 font-display text-4xl leading-none tabular-nums" aria-live="polite">
              {isLoading ? '…' : stat.value}
            </p>
          </div>
        ))}
      </div>
      {unnamedCodes > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          {plural(unnamedCodes, 'código sem nome não entra', 'códigos sem nome não entram')} na contagem.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-6 space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar convidado por nome ou código"
            label="Buscar no relatório de convidados"
            resultCount={filteredRows.length}
            filter={{
              legend: 'Resposta',
              options: RESPONSE_FILTERS,
              value: responseFilter,
              defaultValue: 'all',
              onChange: setResponseFilter,
            }}
          />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">
            {isFiltering ? `${filteredRows.length} de ${plural(rows.length, 'convidado', 'convidados')}` : plural(rows.length, 'convidado', 'convidados')}
          </p>
        </div>
      ) : null}

      {isFiltering && filteredRows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">
          Nenhum convidado encontrado.{' '}
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setResponseFilter('all');
            }}
            className="underline underline-offset-2 hover:text-zinc-900"
          >
            Limpar busca
          </button>
        </p>
      ) : null}

      {filteredRows.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800/10 bg-cream">
        <div className="scroll-pill max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#f6edd7] text-[0.68rem] font-medium uppercase tracking-[0.14em] text-zinc-800/70">
              <tr>
                <th className="w-12 px-4 py-3 text-right">#</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Convite</th>
                <th className="hidden px-4 py-3 sm:table-cell">Tipo</th>
                <th className="px-4 py-3">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.key} className="border-t border-zinc-800/10 text-zinc-700 transition-colors hover:bg-[#f6edd7]/50">
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-800">{row.name}</p>
                    {row.companions.length > 0 ? <p className="text-xs text-zinc-500">com {row.companions.join(' e ')}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.code}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{row.isCouple ? 'Casal' : 'Convidado'}</td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${RESPONSE_BADGE[row.response].className}`}>
                      {RESPONSE_BADGE[row.response].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      ) : null}

      {!isLoading && rows.length === 0 ? <p className="mt-6 text-sm text-zinc-600">Nenhum convidado cadastrado ainda.</p> : null}
    </section>
  );
}
