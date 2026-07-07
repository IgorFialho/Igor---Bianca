import { weddingDetails } from '@/lib/invite';

const detailItems = [
  {
    label: 'Data',
    value: weddingDetails.date,
  },
  {
    label: 'Local',
    value: weddingDetails.venue,
  },
  {
    label: 'Horário',
    value: weddingDetails.time,
  },
];

export function InviteDetails() {
  return (
    <section className="frosted-light gold-frame relative z-10 ml-auto w-full max-w-md rounded-[1.2rem] p-5 sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-600">Cerimonia no Campo</p>
          <h2 className="mt-2 font-display text-4xl leading-none text-champagne-800">{weddingDetails.hostNames}</h2>
        </div>

        <article className="rounded-xl border border-white/70 bg-white/72 p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.34em] text-zinc-600">Data</p>
          <p className="mt-2 font-display text-3xl text-zinc-800">15 MAI 2026</p>
        </article>

        <div className="space-y-2 rounded-xl border border-white/70 bg-white/72 p-4 text-sm text-zinc-700">
          {detailItems.map((item) => (
            <p key={item.label}>
              <span className="font-semibold text-zinc-800">{item.label}: </span>
              {item.value}
            </p>
          ))}
          <p>
            <span className="font-semibold text-zinc-800">Endereco: </span>
            {weddingDetails.address}
          </p>
        </div>
      </div>
    </section>
  );
}
