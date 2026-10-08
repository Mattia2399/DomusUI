import type { EnergyHistoryPreset, EnergyHistoryResult } from '../../../services/energyCoreClient';
import { useConsumptionCopy, type ConsumptionCopyKey } from '../../../i18n/consumptionCopy';
import { formatKwh } from './energyHistoryModel';
import { KPIS, TOTALS, formatPercent, kpiText, periodKpis, periodText, periodTotals, readChange } from './energyAnalyticsModel';

/*
 * Period totals, KPIs and the comparison with the previous period of the
 * Andamento section, as get_history returns them (A2.2A). Values are
 * formatted, never computed; the up and down arrows are neutral.
 */

const SUBTITLE = 'text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]';
const TILE = 'min-w-0 rounded-[1.1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5';
const SMALL = 'text-[11px] leading-4 text-[color:var(--ui-text-secondary)]';
const SO_FAR = 'ml-1 text-[11px] font-medium text-[color:var(--ui-text-tertiary)]';

const BUCKET_PLURAL: Record<EnergyHistoryResult['range']['bucket'], [ConsumptionCopyKey, ConsumptionCopyKey]> = {
  hour: ['ora', 'ore'],
  day: ['giorno', 'giorni'],
  week: ['settimana', 'settimane'],
  month: ['mese', 'mesi'],
};

export function PeriodTotals({ result, period, inProgress }: { result: EnergyHistoryResult; period: EnergyHistoryPreset; inProgress: boolean }) {
  const { c, locale } = useConsumptionCopy();
  const totals = periodTotals(result, period, locale);
  if (!totals.length) return null;
  return (
    <section className="mt-4" aria-labelledby="energy-period-title">
      <h3 id="energy-period-title" className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{c('Energia nel periodo')}</h3>
      <p className={`mt-0.5 ${SMALL}`}>{periodText(period, locale).current}{inProgress ? ` · ${c('periodo in corso')}` : ''}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {totals.map(({ id, label, reading, change }) => (
          <div key={id} className={TILE} data-total={id}>
            <dt className={SUBTITLE}>{label}</dt>
            <dd className="mt-1">
              <span className="text-lg font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{reading.value}</span>
              {reading.soFar ? <span className={SO_FAR}>{c('finora')}</span> : null}
              {reading.incomplete ? (
                <span className="mt-0.5 block text-[11px] font-semibold text-[color:var(--ui-warning)]">{c('Dati incompleti')}</span>
              ) : null}
              {reading.note ? <span className="block text-[10px] leading-4 text-[color:var(--ui-text-tertiary)]">{reading.note}</span> : null}
              {change ? (
                <span className="mt-1 block text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">
                  <span aria-hidden="true">
                    {/* A change has a neutral accent; a missing comparison stays plain text. */}
                    <span className={change.suffix ? 'font-semibold text-[color:var(--ui-accent)]' : ''}>{change.main}</span>
                    {change.suffix ? ` ${change.suffix}` : null}
                  </span>
                  <span className="sr-only">{change.sentence}</span>
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {result.previous && inProgress ? (
        <p className={`mt-2 ${SMALL}`}>{c('Il confronto esclude il periodo ancora in corso.')}</p>
      ) : null}
    </section>
  );
}

export function PeriodKpis({ result }: { result: EnergyHistoryResult }) {
  const { c, locale } = useConsumptionCopy();
  const kpis = periodKpis(result, locale);
  if (!kpis.length) return null;
  return (
    <section className="mt-5" aria-labelledby="energy-kpi-title">
      <h3 id="energy-kpi-title" className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{c('Come usi la tua energia')}</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {kpis.map(({ id, label, description, bar, reading }) => (
          <li
            key={id}
            data-kpi={id}
            className={TILE}
            aria-label={`${label}: ${reading.value}${reading.soFar ? `, ${c('finora')}` : ''}. ${description}${reading.note ? ` ${reading.note}` : ''}`}
          >
            <p className="text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">{label}</p>
            <p className="mt-1">
              <span className={`font-semibold tabular-nums text-[color:var(--ui-text-primary)] ${reading.value.endsWith('%') ? 'text-2xl' : 'text-base'}`}>
                {reading.value}
              </span>
              {reading.soFar ? <span className={SO_FAR}>{c('finora')}</span> : null}
            </p>
            {bar && reading.percent !== null ? (
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[color:var(--ui-separator)]" aria-hidden="true">
                <span className="block h-full rounded-full bg-[color:var(--ui-accent)]" style={{ width: `${Math.max(0, Math.min(100, reading.percent))}%` }} />
              </span>
            ) : null}
            <p className={`mt-2 ${SMALL}`}>{description}</p>
            {reading.note ? <p className="mt-1 text-[11px] leading-4 text-[color:var(--ui-text-primary)]">{reading.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Come viene calcolato?": the method in words and, with a comparison, its closed buckets. */
export function PeriodMethod({ result, period, inProgress }: { result: EnergyHistoryResult; period: EnergyHistoryPreset; inProgress: boolean }) {
  const { c, locale } = useConsumptionCopy();
  const kpis = KPIS.filter((meta) => result.kpis[meta.id]).map((meta) => ({ id: meta.id, ...kpiText(meta, locale) }));
  const comparison = result.previous?.comparison;
  const rows = comparison
    ? TOTALS.flatMap(({ id, label }) => {
        const change = comparison.series[id];
        return change && result.summary[id]?.status !== 'unavailable' ? [{ id, label: c(label), change }] : [];
      })
    : [];
  const [one, many] = BUCKET_PLURAL[result.range.bucket];
  const amount = (value: number | null) => (value === null ? c('Non disponibile') : `${formatKwh(value)} kWh`);
  return (
    <details className="group mt-4 rounded-[1.1rem] border border-[color:var(--ui-border)] px-3 py-2">
      <summary className="cursor-pointer list-none rounded-lg py-1 text-xs font-semibold text-[color:var(--ui-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]">
        <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
        {c('Come viene calcolato?')}
      </summary>
      <div className={`space-y-2 pb-2 pt-1 ${SMALL}`}>
        <p>
          {c('I totali sono l’energia registrata dai contatori in Home Assistant nel periodo.')}
          {inProgress ? ` ${c('Con il periodo in corso valgono “finora”: l’ultimo intervallo non è concluso.')}` : ''}
          {' '}{c('Se manca un intervallo il totale non viene mostrato, solo l’energia misurata.')}
        </p>
        {kpis.length ? (
          <dl className="space-y-1">
            {kpis.map((meta) => (
              <div key={meta.id}>
                <dt className="inline font-semibold text-[color:var(--ui-text-primary)]">{meta.label}: </dt>
                <dd className="inline">{meta.method}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {comparison && rows.length ? (
          <>
            <p>
              {c('Il confronto {previous} usa solo gli intervalli conclusi: {count} {unit} per ciascun periodo, alla stessa posizione.', {
                previous: periodText(period, locale).previous,
                count: comparison.buckets,
                unit: c(comparison.buckets === 1 ? one : many),
              })}
            </p>
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">{c('Confronto sugli intervalli conclusi')}</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--ui-text-tertiary)]">
                  <th scope="col" className="py-1 pr-2 font-semibold">{c('Energia')}</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">{c('Periodi conclusi')}</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">{c('Precedenti')}</th>
                  <th scope="col" className="py-1 font-semibold">{c('Variazione')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, label, change }) => {
                  const percent = change.percent_change;
                  return (
                    <tr key={id} className="border-t border-[color:var(--ui-separator)]">
                      <th scope="row" className="py-1 pr-2 font-medium text-[color:var(--ui-text-primary)]">{label}</th>
                      <td className="py-1 pr-2">{amount(change.current)}</td>
                      <td className="py-1 pr-2">{amount(change.previous)}</td>
                      <td className="py-1">
                        {percent !== null
                          ? `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${formatPercent(Math.abs(percent), locale)}`
                          : readChange(change, label, '', locale)?.main}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </details>
  );
}
