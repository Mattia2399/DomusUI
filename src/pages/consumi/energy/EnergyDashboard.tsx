import React from 'react';
import {
  BarChart3,
  Battery,
  Clock3,
  CalendarClock,
  CarFront,
  ChevronRight,
  Gauge,
  Leaf,
  SunMedium,
  TowerControl,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import GlassSegmentSelect from '../../../components/ui/GlassSegmentSelect';
import type { EnergyHistory, EnergyHistoryPeriod, EnergyModuleId, EnergyModuleState, EnergyState } from '../../../services/energyCoreClient';
import { EnergyHistoryChart } from './EnergyHistoryChart';
import { EnergyModuleSheet, describeQuantity, liveFlows, okValue } from './EnergyModuleSheet';
import { PERIOD_LABEL, formatEuro, formatKwh, formatPercent, historyBalance } from './energyHistoryModel';
import { EnergyHomeVisual, FLOW_COLORS } from './EnergyHomeVisual';
import { MODULE_META, buildFlowFromState, formatAge, formatPower, formatQuantity, staleSince } from './energyModel';

type HistoryPeriod = EnergyHistoryPeriod;

const CARD = 'rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5';
const EYEBROW = 'text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]';
const TITLE = 'mt-1 text-lg font-semibold tracking-[-0.03em] text-[color:var(--ui-text-primary)]';
const MUTED = 'text-xs text-[color:var(--ui-text-secondary)]';

const MODULES: Array<{ id: EnergyModuleId; icon: LucideIcon; accent: string }> = [
  { id: 'solar', icon: SunMedium, accent: 'text-amber-400' },
  { id: 'grid', icon: TowerControl, accent: 'text-sky-400' },
  { id: 'battery', icon: Battery, accent: 'text-emerald-400' },
  { id: 'wallbox', icon: CarFront, accent: 'text-violet-400' },
];


export function energySystemStatus(state: EnergyState) {
  const modules = Object.values(state.modules).filter((module): module is EnergyModuleState => Boolean(module));
  const online = modules.filter((module) => module.status === 'online').length;
  if (online === 0) return { label: 'Sensori offline', dot: 'bg-amber-400', live: false };
  if (online < modules.length || modules.some((module) => !module.complete)) return { label: 'Dati parziali', dot: 'bg-amber-400', live: false };
  if (modules.some((module) => module.freshness === 'stale')) return { label: 'Dati non aggiornati', dot: 'bg-amber-400', live: false };
  return { label: 'In tempo reale', dot: 'bg-emerald-400', live: true };
}

const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** Where the home consumption figure comes from, in plain words. */
function homeOrigin(state: EnergyState) {
  const home = state.home_consumption;
  if (home?.status !== 'ok') return describeQuantity(home);
  if (home.source !== 'derived') return 'Misurato dal sensore della casa';
  const parts = (['grid', 'solar', 'battery'] as const).filter((id) => state.modules[id]).map((id) => MODULE_META[id].label.toLowerCase());
  return `Calcolato da ${listOf(parts)}`;
}

type SourceId = 'solar' | 'battery' | 'grid';
export type HomeSource = { id: SourceId; label: string; percent: number };

/**
 * Live split of the home consumption among its supplies: solar production, battery discharge
 * and grid import. Exports and battery charging draw on the same supplies, so each supply feeds
 * the home in proportion. Null when any present source is unknown or there is no plant to split.
 */
export function homeSources(state: EnergyState): HomeSource[] | null {
  const ids = (['solar', 'battery', 'grid'] as const).filter((id) => state.modules[id]);
  const flows = liveFlows(state);
  if (!flows || ids.length < 2 || !(okValue(state.home_consumption)! > 0)) return null;
  // Largest remainder, so the rounded shares always add up to 100.
  const raw = ids.map((id) => (flows.supply[id] / flows.total) * 100);
  const percents = raw.map(Math.floor);
  const order = raw.map((value, index) => [value - percents[index], index]).sort((a, b) => b[0] - a[0]);
  for (let index = 0; index < 100 - percents.reduce((sum, value) => sum + value, 0); index += 1) percents[order[index][1]] += 1;
  return ids.map((id, index) => ({ id, label: MODULE_META[id].label, percent: percents[index] }));
}

const TILE = 'flex min-h-[8.5rem] flex-col rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3.5 shadow-[var(--ui-shadow-card)] sm:p-4';

/** Compact component tile: icon, value and one status line; it opens the component's details. */
function ModuleTile({
  id,
  icon: Icon,
  accent,
  module,
  now,
  onOpen,
}: {
  id: EnergyModuleId;
  icon: LucideIcon;
  accent: string;
  module: EnergyModuleState;
  now: string;
  onOpen: () => void;
}) {
  const q = module.quantities;
  const offline = module.status === 'offline';
  const stale = !offline && module.freshness === 'stale';
  const soc = okValue(q.state_of_charge);
  const flow = okValue(id === 'grid' || id === 'battery' ? q.net_power : q.production_power ?? q.charging_power);
  const still = flow !== null && Math.abs(flow) < 10;
  let value = flow === null ? '—' : formatPower(Math.abs(flow));
  let caption: string;
  if (id === 'grid') {
    caption = flow === null ? describeQuantity(q.net_power) : still ? 'Nessuno scambio' : flow > 0 ? 'Prelievo dalla rete' : 'Immissione in rete';
  } else if (id === 'battery') {
    if (soc !== null) value = `${Math.round(soc)}%`;
    caption = flow === null ? describeQuantity(q.net_power) : still ? 'In attesa' : `${flow > 0 ? 'In scarica' : 'In carica'} · ${formatPower(Math.abs(flow))}`;
  } else if (id === 'wallbox') {
    caption = flow === null ? describeQuantity(q.charging_power) : still ? 'Nessuna ricarica' : 'In ricarica';
  } else {
    caption = flow === null ? describeQuantity(q.production_power) : still ? 'Nessuna produzione' : 'Produzione attuale';
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`${TILE} text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)] ${offline ? 'border-dashed' : ''}`}
    >
      <span className="flex w-full items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${offline ? 'text-[color:var(--ui-text-tertiary)]' : accent}`} aria-hidden="true" />
        <span className={`truncate ${EYEBROW}`}>{MODULE_META[id].label}</span>
        <span
          className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${offline || stale || !module.complete ? 'bg-amber-400' : 'bg-emerald-400'}`}
          title={offline ? 'Offline' : stale ? 'Non aggiornato' : module.complete ? 'Attivo' : 'Dati parziali'}
          aria-hidden="true"
        />
        <ChevronRight className="-mr-1 h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
      </span>
      <span className="mt-auto block pt-3 text-[1.6rem] font-semibold leading-none tracking-[-0.045em] text-[color:var(--ui-text-primary)]">{offline ? '—' : value}</span>
      {id === 'battery' && soc !== null && !offline ? (
        <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-[color:var(--ui-fill-tertiary)]">
          <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${soc}%` }} />
        </span>
      ) : null}
      <span className={`mt-1.5 block w-full truncate ${MUTED}`}>
        {offline ? 'Offline · sensori senza dati' : stale ? `Non aggiornato ${formatAge(staleSince(q), now)}` : caption}
      </span>
    </button>
  );
}

function HistoryCard({ state, history, period, onPeriod }: { state: EnergyState; history?: EnergyHistory; period: HistoryPeriod; onPeriod: (period: HistoryPeriod) => void }) {
  const series = [
    state.modules.solar ? 'Produzione fotovoltaica' : null,
    'Consumo della casa',
    state.modules.grid ? 'Prelievo dalla rete' : null,
    state.modules.grid ? 'Immissione in rete' : null,
    state.modules.battery ? 'Carica e scarica batteria' : null,
  ].filter((item): item is string => Boolean(item));
  const balance = history ? historyBalance(history) : null;
  const totals: Array<[string, number | null] | null> = [
    state.modules.solar ? ['Prodotta', balance?.production ?? null] : null,
    ['Consumata', balance?.consumption ?? null],
    state.modules.grid ? ['Prelevata', balance?.imported ?? null] : null,
    state.modules.grid ? ['Immessa', balance?.exported ?? null] : null,
  ];
  const when = period === '24h' ? 'in 24 ore' : period === '7d' ? 'in 7 giorni' : 'in 30 giorni';
  return (
    <section className={CARD} aria-labelledby="energy-history-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={EYEBROW}>Andamento</p>
          <h2 id="energy-history-title" className={TITLE}>Energia nel tempo</h2>
          <p className={`mt-1 ${MUTED}`}>Energia per intervallo, in kWh</p>
        </div>
        <GlassSegmentSelect
          value={period}
          onChange={(value) => onPeriod(value as HistoryPeriod)}
          options={[
            { value: '24h', label: '24 ore' },
            { value: '7d', label: '7 giorni' },
            { value: '30d', label: '30 giorni' },
          ]}
          ariaLabel="Intervallo del grafico"
          className="w-full sm:w-[18rem]"
          optionClassName="!h-9 !px-2"
        />
      </div>
      {history ? (
        <EnergyHistoryChart key={period} history={history} />
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Serie disponibili per questo impianto">
            {series.map((item) => (
              <li key={item} className="rounded-full border border-[color:var(--ui-border)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">{item}</li>
            ))}
          </ul>
          <div className="mt-4 flex min-h-[15rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-[color:var(--ui-border)] px-6 text-center">
            <span className="liquid-glass-control flex h-12 w-12 items-center justify-center rounded-full">
              <BarChart3 className="h-5 w-5 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-[color:var(--ui-text-primary)]">Storico non ancora disponibile</h3>
            <p className="mt-1 max-w-md text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              Domus Energy legge oggi solo le potenze istantanee: il grafico si attiverà con l’archivio energetico di Home Assistant.
            </p>
          </div>
        </>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {totals.filter((item): item is [string, number | null] => Boolean(item)).map(([label, value]) => (
          <div key={label} className="rounded-[1.1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5">
            <dt className={EYEBROW}>{label} {when}</dt>
            <dd className="mt-1 text-lg font-semibold text-[color:var(--ui-text-primary)]">{formatKwh(value)} <span className="text-[10px] font-normal text-[color:var(--ui-text-tertiary)]">kWh</span></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type AnalysisRow = { icon: LucideIcon; label: string; value: string; detail?: string; known?: boolean };

function AnalysisCard({ state, history }: { state: EnergyState; history?: EnergyHistory }) {
  const solar = Boolean(state.modules.solar);
  const waiting = 'Richiede lo storico energetico';
  const tariff = state.tariff;
  const missing = 'tariff' in state ? 'Tariffa non configurata' : 'Aggiorna l’integrazione Domus UI';
  const price = (value: number) => `${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kWh`;
  const balance = history ? historyBalance(history) : null;
  const cost = history?.cost ?? null;
  const known = (value: string | null, fallback: string, detail?: string): Pick<AnalysisRow, 'value' | 'known' | 'detail'> =>
    value === null ? { value: fallback } : { value, known: true, detail };
  const rows: Array<AnalysisRow | null> = [
    { icon: Clock3, label: 'Fascia attuale', ...known(tariff ? `${tariff.band_label} · ${price(tariff.price)}` : null, missing) },
    solar
      ? { icon: Gauge, label: 'Autoconsumo', ...known(balance?.selfConsumption == null ? null : formatPercent(balance.selfConsumption), waiting, 'Energia solare usata in casa') }
      : null,
    solar || state.modules.battery
      ? { icon: Leaf, label: 'Autosufficienza', ...known(balance?.selfSufficiency == null ? null : formatPercent(balance.selfSufficiency), waiting, 'Consumi coperti senza la rete') }
      : null,
    {
      icon: TrendingUp,
      label: 'Costi energetici',
      ...known(
        cost ? formatEuro(cost.net) : null,
        tariff ? waiting : missing,
        cost
          ? `Energia ${formatEuro(cost.energy)} · quota fissa ${formatEuro(cost.fixed)} · IVA ${formatEuro(cost.vat)}${cost.export_credit ? ` · immessa −${formatEuro(cost.export_credit)}` : ''}`
          : undefined,
      ),
    },
    solar
      ? { icon: TrendingDown, label: 'Risparmio stimato', ...known(cost?.savings == null ? null : formatEuro(cost.savings), 'Richiede tariffa e storico', 'Energia autoprodotta al prezzo della rete') }
      : null,
    {
      icon: CalendarClock,
      label: 'Confronto con il periodo precedente',
      ...known(balance?.change == null ? null : `${formatPercent(balance.change, true)} di consumo`, waiting),
    },
  ];
  return (
    <section className={CARD} aria-labelledby="energy-analysis-title">
      <p className={EYEBROW}>Analisi</p>
      <h2 id="energy-analysis-title" className={TITLE}>Bilancio e costi</h2>
      {history ? <p className={`mt-1 ${MUTED}`}>{PERIOD_LABEL[history.period]}</p> : null}
      <ul className="mt-4 divide-y divide-[color:var(--ui-separator)]">
        {rows.filter((row): row is AnalysisRow => Boolean(row)).map((row) => (
          <li key={row.label} className="flex items-start gap-3 py-2.5">
            <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[color:var(--ui-text-primary)]">{row.label}</span>
              {row.detail ? <span className="block text-[10px] text-[color:var(--ui-text-tertiary)]">{row.detail}</span> : null}
            </span>
            <span className={row.known ? 'text-right text-sm font-semibold tabular-nums text-[color:var(--ui-text-primary)]' : 'text-right text-[10px] text-[color:var(--ui-text-tertiary)]'}>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tablet row: one column per installed component (literal classes for Tailwind). */
const TABLET_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4'];

/** Mobile cards sit on the sheet; from md they join the page grid like Irrigation. */
const SECTION = 'mx-3 mb-3 md:mx-0 md:mb-0';
const PROGRESS = 'var(--energy-scroll-progress)';

function EnergyHero({ state, onOpenHome }: { state: EnergyState; onOpenHome: () => void }) {
  const status = energySystemStatus(state);
  const home = state.home_consumption;
  const sources = homeSources(state);
  // Measured or calculated paths are facts; an ambiguous split is only an estimate.
  const estimated = Boolean(liveFlows(state)?.estimated);
  return (
    <div
      data-testid="energy-hero"
      className="relative flex h-[clamp(33rem,78svh,39rem)] flex-col overflow-hidden bg-[#10151b] text-white md:h-full md:min-h-[38rem] md:rounded-[2rem]"
    >
      <div
        className="absolute inset-x-0 bottom-28 top-[calc(env(safe-area-inset-top)+11.75rem)] [will-change:transform] motion-reduce:!transform-none md:bottom-12 md:top-36 md:!transform-none"
        style={{ transform: `translate3d(0, calc(${PROGRESS} * 18px), 0) scale(calc(1.045 - ${PROGRESS} * 0.045))`, transformOrigin: 'center top' }}
      >
        <EnergyHomeVisual state={state} view={buildFlowFromState(state)} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black motion-reduce:hidden md:hidden" style={{ opacity: `calc(${PROGRESS} * 0.5)` }} />
      <div
        className="relative z-10 px-4 pt-[calc(env(safe-area-inset-top)+5.25rem)] motion-reduce:!transform-none motion-reduce:!opacity-100 md:!transform-none md:!opacity-100 md:p-7 lg:p-8"
        style={{ opacity: `calc(1 - ${PROGRESS} * 1.15)`, transform: `translate3d(0, calc(${PROGRESS} * -24px), 0)` }}
      >
        {/* The status speaks only when something needs attention; live data is the normal case. */}
        {status.live ? null : (
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-amber-200 backdrop-blur-md">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </p>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 id="energy-hero-title" className="text-[13px] font-medium text-white/75">Consumo della casa</h2>
              <button
                type="button"
                onClick={onOpenHome}
                aria-haspopup="dialog"
                aria-label="Dettagli del consumo della casa"
                className="-my-2 flex h-8 w-8 items-center justify-center rounded-full text-white/75 hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[2.7rem] font-light leading-none tracking-[-0.06em] sm:text-[3.5rem]">{formatQuantity(home)}</p>
            <p className="mt-2 text-xs text-white/70">{homeOrigin(state)}</p>
          </div>
          {sources ? (
            <div className="shrink-0 pt-0.5 sm:pt-1">
              <ul aria-label="Da dove arriva l’energia della casa" className="space-y-1.5 sm:space-y-2">
                {sources.map((source) => (
                  <li key={source.id} className="flex items-center gap-2 text-xs sm:text-[13px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${FLOW_COLORS[source.id]})` }} aria-hidden="true" />
                    <span className="flex-1 text-white/75">{source.label}</span>
                    <span className="w-11 text-right font-semibold tabular-nums">{estimated ? '≈' : ''}{source.percent}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-right text-[10px] text-white/60">{estimated ? 'Stima · percorsi non misurabili' : 'Calcolata dai contatori'}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EnergyDashboard({
  state,
  banner,
  history,
  onEditModule,
}: {
  state: EnergyState;
  banner?: React.ReactNode;
  /** Administrators can jump from a component's details to its sensors in the settings. */
  onEditModule?: (id: EnergyModuleId) => void;
  /** Period history from the proposed get_history command; absent until the backend provides it. */
  history?: Partial<Record<HistoryPeriod, EnergyHistory>>;
}) {
  const [period, setPeriod] = React.useState<HistoryPeriod>('24h');
  const [details, setDetails] = React.useState<EnergyModuleId | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const present = MODULES.filter((item) => state.modules[item.id]);

  // Same progressive hero as Irrigation: the photo stays behind while the sheet rises.
  React.useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>('[data-scroll-root]');
    if (!root || !scroller) return undefined;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty('--energy-scroll-progress', (reduceMotion ? 1 : Math.max(0, Math.min(1, scroller.scrollTop / 220))).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="energy-experience"
      className="relative isolate grid min-h-full grid-cols-1 content-start bg-[color:var(--ui-bg-grouped)] pb-6 max-md:-mt-[calc(env(safe-area-inset-top)+4.65rem)] md:gap-5 md:bg-transparent md:px-6 md:pt-2 lg:px-8 xl:grid-flow-row-dense xl:grid-cols-12 xl:px-10"
      style={{ '--energy-scroll-progress': 0 } as React.CSSProperties}
    >
      {/* Desktop: hero beside the tiles and the analysis; dense flow lets the analysis fill the second row. */}
      <section className="sticky top-0 z-0 md:static xl:col-span-8 xl:row-span-2" aria-labelledby="energy-hero-title">
        <EnergyHero state={state} onOpenHome={() => setDetails('home')} />
      </section>

      <div
        data-testid="energy-sheet"
        className="relative z-10 isolate -mt-28 rounded-t-[2rem] pt-4 shadow-[0_-12px_34px_rgba(2,6,23,0.12)] md:contents"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 rounded-t-[2rem] md:hidden"
          style={{ background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--ui-bg-grouped) 62%, transparent) 8rem, var(--ui-bg-grouped) 15rem)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-t-[2rem] bg-[color:var(--ui-bg-grouped)] motion-reduce:!opacity-100 md:hidden"
          style={{ opacity: `calc(${PROGRESS} * 0.96)` }}
        />
        {banner ? <div className={`${SECTION} space-y-3 md:order-first xl:col-span-12`}>{banner}</div> : null}

        <div
          className={`${SECTION} grid grid-cols-2 content-start gap-3 md:gap-4 xl:col-span-4 xl:grid-cols-2 xl:auto-rows-[minmax(8.5rem,11.5rem)] ${TABLET_COLUMNS[present.length] ?? 'md:grid-cols-4'}`}
          aria-label="Componenti dell’impianto"
          role="list"
        >
          {present.map((item, index) => (
            // An odd last tile takes the whole row where tiles sit two by two.
            <div key={item.id} role="listitem" className={`grid ${present.length % 2 && index === present.length - 1 ? 'col-span-2 md:col-span-1 xl:col-span-2' : ''}`}>
              <ModuleTile {...item} module={state.modules[item.id] as EnergyModuleState} now={state.observed_at} onOpen={() => setDetails(item.id)} />
            </div>
          ))}
        </div>

        <div className={`${SECTION} xl:col-span-12`}><HistoryCard state={state} history={history?.[period]} period={period} onPeriod={setPeriod} /></div>
        <div className={`${SECTION} xl:col-span-4`}><AnalysisCard state={state} history={history?.[period]} /></div>
      </div>
      <EnergyModuleSheet
        id={details}
        state={state}
        history={history?.['24h']}
        onClose={() => setDetails(null)}
        onEdit={onEditModule ? (id) => { setDetails(null); onEditModule(id); } : undefined}
      />
    </div>
  );
}
