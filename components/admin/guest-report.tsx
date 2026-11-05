"use client";

import { useMemo, useState } from 'react';
import { SearchField, type SearchFilterOption } from '@/components/admin/search-field';
import { formatPhone, whatsappLink } from '@/lib/phone';

type ReportChild = { fullName: string; age: number };
type ReportCode = {
  id: string;
  code: string;
  guest_name: string | null;
  phone?: string | null;
  rsvp_attendance?: 'yes' | 'no' | null;
  /** Nomes digitados por quem confirmou presença ("Nome | Nome"). */
  rsvp_responder_name?: string | null;
  rsvp_children_count?: number;
  /** O casal tem filhos, mas avisou no RSVP que eles não irão. */
  rsvp_children_not_attending?: boolean;
  rsvp_children?: ReportChild[];
};

type ResponseStatus = 'yes' | 'no' | 'pending';
type ResponseFilter = 'all' | ResponseStatus;
type PeopleFilter = 'all' | 'adults' | 'children';

type GuestRow = {
  key: string;
  name: string;
  code: string;
  /** Telefone do convite (só nas linhas de adultos do convite; filhos ficam sem). */
  phone: string | null;
  /** Quem divide o convite (para adultos) ou de quem é filho(a) (para crianças). */
  related: string[];
  /** Nome cadastrado no código, quando quem confirmou digitou um nome diferente. */
  registeredAs: string | null;
  /** Último adulto de um convite cujos filhos não irão (o aviso aparece só nessa linha). */
  childrenNotAttending: boolean;
  isChild: boolean;
  isAdult: boolean;
  /** Idade informada no RSVP (só para filhos); null quando não foi informada. */
  age: number | null;
  isCouple: boolean;
  response: ResponseStatus;
};

// Filhos com mais de 12 anos contam como adultos.
const CHILD_MAX_AGE = 12;

const RESPONSE_FILTERS: SearchFilterOption<ResponseFilter>[] = [
  { id: 'all', label: 'Todas' },
  { id: 'yes', label: 'Confirmaram' },
  { id: 'no', label: 'Recusaram' },
  { id: 'pending', label: 'Sem resposta' },
];

const PEOPLE_FILTERS: SearchFilterOption<PeopleFilter>[] = [
  { id: 'all', label: 'Todos' },
  { id: 'adults', label: 'Adultos' },
  { id: 'children', label: 'Crianças' },
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
const ageLabel = (age: number) => (age === 1 ? '1 ano' : `${age} anos`);

// Relatório da lista de convidados: um nome por linha, agrupado por convite (adultos e, logo abaixo, os filhos
// informados no RSVP). Quem já confirmou presença aparece com o nome que digitou no RSVP; os demais, com o nome
// cadastrado no código. Calculado a partir dos códigos que o painel já carregou, então acompanha cada mudança.
export function GuestReport({ codes, isLoading }: { codes: ReportCode[]; isLoading: boolean }) {
  const [search, setSearch] = useState('');
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>('all');
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>('all');

  const { rows, unnamedCodes } = useMemo(() => {
    const invites = codes
      .map((code) => {
        const registered = splitNames(code.guest_name);
        const typed = code.rsvp_attendance === 'yes' ? splitNames(code.rsvp_responder_name ?? null) : [];
        return { code, registered, names: typed.length > 0 ? typed : registered };
      })
      .filter((invite) => invite.registered.length > 0)
      .sort((a, b) => a.names[0].localeCompare(b.names[0], 'pt-BR', { sensitivity: 'base' }));

    const list: GuestRow[] = [];
    for (const { code, names, registered } of invites) {
      const response: ResponseStatus = code.rsvp_attendance === 'yes' ? 'yes' : code.rsvp_attendance === 'no' ? 'no' : 'pending';
      const isCouple = names.length > 1;
      const sameCount = registered.length === names.length;

      names.forEach((name, index) => {
        // Mostra o nome cadastrado só quando difere do digitado (pareado pela ordem; se a quantidade mudou, mostra todos).
        const original = sameCount ? registered[index] : registered.join(' e ');
        list.push({
          key: `${code.id}-a${index}`,
          name,
          code: code.code,
          phone: code.phone ?? null,
          related: names.filter((_, other) => other !== index),
          registeredAs: normalize(original) !== normalize(name) ? original : null,
          childrenNotAttending: response === 'yes' && Boolean(code.rsvp_children_not_attending) && index === names.length - 1,
          isChild: false,
          isAdult: true,
          age: null,
          isCouple,
          response,
        });
      });

      // Filhos só existem em quem confirmou presença.
      if (response !== 'yes') continue;
      const children = code.rsvp_children ?? [];
      children.forEach((child, index) => {
        const age = Number.isFinite(child.age) ? child.age : null;
        const isAdult = age !== null && age > CHILD_MAX_AGE;
        list.push({
          key: `${code.id}-c${index}`,
          name: child.fullName,
          code: code.code,
          phone: null,
          related: names,
          registeredAs: null,
          childrenNotAttending: false,
          isChild: true,
          isAdult,
          age,
          isCouple,
          response,
        });
      });
      // Convite sem "Exigir dados dos filhos": só a quantidade foi informada (idade desconhecida, conta como criança).
      const missing = Math.max(0, (code.rsvp_children_count ?? 0) - children.length);
      for (let index = 0; index < missing; index++) {
        list.push({
          key: `${code.id}-m${index}`,
          name: missing > 1 ? `Filho(a) ${index + 1} sem nome informado` : 'Filho(a) sem nome informado',
          code: code.code,
          phone: null,
          related: names,
          registeredAs: null,
          childrenNotAttending: false,
          isChild: true,
          isAdult: false,
          age: null,
          isCouple,
          response,
        });
      }
    }

    const unnamed = codes.length - invites.length;
    return { rows: list, unnamedCodes: unnamed };
  }, [codes]);

  const query = normalize(search.trim());
  const filteredRows = rows.filter((row) => {
    if (responseFilter !== 'all' && row.response !== responseFilter) return false;
    if (peopleFilter === 'adults' && !row.isAdult) return false;
    if (peopleFilter === 'children' && row.isAdult) return false;
    return !query || normalize(`${row.name} ${row.registeredAs ?? ''} ${row.code} ${row.phone ?? ''} ${formatPhone(row.phone)} ${row.related.join(' ')}`).includes(query);
  });
  const isFiltering = query !== '' || responseFilter !== 'all' || peopleFilter !== 'all';

  const adults = rows.filter((row) => row.isAdult).length;
  const children = rows.length - adults;
  const childrenWithoutAge = rows.filter((row) => row.isChild && row.age === null).length;
  const confirmed = rows.filter((row) => row.response === 'yes').length;
  const declined = rows.filter((row) => row.response === 'no').length;
  const pending = rows.length - confirmed - declined;
  const invites = codes.length - unnamedCodes;

  const peopleStats = [
    { label: 'Total de convidados', value: rows.length, highlight: true },
    { label: 'Adultos', value: adults },
    { label: 'Crianças', value: children },
  ];
  const responseStats = [
    { label: 'Convites', value: invites },
    { label: 'Confirmaram', value: confirmed },
    { label: 'Recusaram', value: declined },
    { label: 'Sem resposta', value: pending },
  ];

  const statCard = (stat: { label: string; value: number; highlight?: boolean }) => (
    <div
      key={stat.label}
      className={`rounded-2xl border px-5 py-4 ${
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
  );

  const notes = [
    `Filhos com mais de ${CHILD_MAX_AGE} anos contam como adultos.`,
    childrenWithoutAge > 0 ? `${plural(childrenWithoutAge, 'criança está', 'crianças estão')} sem idade informada no RSVP.` : '',
    unnamedCodes > 0 ? `${plural(unnamedCodes, 'código sem nome não entra', 'códigos sem nome não entram')} na contagem.` : '',
  ].filter(Boolean);

  return (
    <section className="rounded-[2rem] border border-zinc-800/10 bg-[#fffaf1] p-6 shadow-[0_24px_60px_rgba(47,36,27,0.08)] sm:p-8">
      <div>
        <h2 className="font-display text-4xl leading-none text-zinc-800">Relatório de convidados</h2>
        <p className="mt-2 text-sm text-zinc-600">Quem confirmou aparece com o nome que digitou no RSVP. Atualizado em tempo real.</p>
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Pessoas</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {peopleStats.map((stat) => (
          <div key={stat.label} className={stat.highlight ? 'col-span-2 sm:col-span-1' : ''}>
            {statCard(stat)}
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-zinc-800/70">Respostas</p>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">{responseStats.map(statCard)}</div>

      <p className="mt-3 text-xs text-zinc-600">{notes.join(' ')}</p>

      {rows.length > 0 ? (
        <div className="mt-6 space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar convidado por nome, código ou telefone"
            label="Buscar no relatório de convidados"
            resultCount={filteredRows.length}
            filters={[
              {
                legend: 'Pessoas',
                options: PEOPLE_FILTERS,
                value: peopleFilter,
                defaultValue: 'all',
                onChange: (value: string) => setPeopleFilter(value as PeopleFilter),
              },
              {
                legend: 'Resposta',
                options: RESPONSE_FILTERS,
                value: responseFilter,
                defaultValue: 'all',
                onChange: (value: string) => setResponseFilter(value as ResponseFilter),
              },
            ]}
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
              setPeopleFilter('all');
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
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={row.key} className="border-t border-zinc-800/10 text-zinc-700 transition-colors hover:bg-[#f6edd7]/50">
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{index + 1}</td>
                    <td className={`px-4 py-3 ${row.isChild ? 'pl-8' : ''}`}>
                      <p className={row.isChild ? 'text-zinc-800' : 'font-medium text-zinc-800'}>
                        {row.isChild ? <span className="mr-1.5 text-zinc-400" aria-hidden="true">↳</span> : null}
                        {row.name}
                      </p>
                      {row.related.length > 0 ? (
                        <p className="text-xs text-zinc-500">
                          {row.isChild ? `filho(a) de ${row.related.join(' e ')}` : `com ${row.related.join(' e ')}`}
                        </p>
                      ) : null}
                      {row.registeredAs ? <p className="text-xs italic text-zinc-400">cadastrado como {row.registeredAs}</p> : null}
                      {row.childrenNotAttending ? <p className="mt-0.5 text-xs font-medium text-amber-700">Filhos não irão</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.code}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {whatsappLink(row.phone) ? (
                        <a
                          href={whatsappLink(row.phone) as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir no WhatsApp"
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950"
                        >
                          {formatPhone(row.phone)}
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.isAdult ? 'Adulto' : 'Criança'}
                      {row.isChild ? (
                        <span className="ml-1 text-xs text-zinc-500">· {row.age === null ? 'idade não informada' : ageLabel(row.age)}</span>
                      ) : row.isCouple ? (
                        <span className="ml-1 text-xs text-zinc-500">· casal</span>
                      ) : null}
                    </td>
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
