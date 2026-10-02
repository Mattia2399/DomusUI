import React from 'react';
import {
  BarChart3,
  Battery,
  CalendarClock,
  CarFront,
  ChevronDown,
  Gauge,
  Home,
  Leaf,
  SunMedium,
  TowerControl,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import GlassSegmentSelect from '../../../components/ui/GlassSegmentSelect';
import type { EnergyModuleId, EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyHomeVisual } from './EnergyHomeVisual';
import { MODULE_META, REASON_LABEL, SOURCE_LABEL, buildFlowFromState, formatPower, formatQuantity } from './energyModel';

type HistoryPeriod = '24h' | '7d' | '30d';

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

const okValue = (quantity: EnergyQuantity | undefined | null) =>
  quantity?.status === 'ok' ? quantity.value : null;

const describeQuantity = (quantity: EnergyQuantity | undefined | null) =>
  quantity?.status === 'ok' && quantity.source ? SOURCE_LABEL[quantity.source] : REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile';

export function energySystemStatus(state: EnergyState) {
  const modules = Object.values(state.modules).filter((module): module is EnergyModuleState => Boolean(module));
  const online = modules.filter((module) => module.status === 'online').length;
  if (online === 0) return { label: 'Sensori offline', dot: 'bg-amber-400' };
  if (online < modules.length || modules.some((module) => !module.complete)) return { label: 'Dati parziali', dot: 'bg-amber-400' };
  return { label: 'In tempo reale', dot: 'bg-emerald-400' };
}

/** Factual one-line summary of the grid exchange; never a recommendation. */
function headline(state: EnergyState) {
  const net = okValue(state.modules.grid?.quantities.net_power);
  if (net === null) return 'La tua casa, adesso';
  if (Math.abs(net) < 10) return 'Nessuno scambio con la rete';
  return net > 0 ? `Prelievo dalla rete: ${formatPower(net)}` : `Immissione in rete: ${formatPower(-net)}`;
}

function Row({ label, quantity, entities = false }: { label: string; quantity: EnergyQuantity | undefined | null; entities?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-[color:var(--ui-text-secondary)]">{label}</span>
      <span className="text-right font-semibold text-[color:var(--ui-text-primary)]">
        {formatQuantity(quantity)} <span className="font-normal text-[color:var(--ui-text-tertiary)]">· {describeQuantity(quantity)}</span>
        {entities && quantity?.entity_ids.length ? <span className="block break-all font-mono text-[10px] font-normal text-[color:var(--ui-text-tertiary)]">{quantity.entity_ids.join(', ')}</span> : null}
      </span>
    </div>
  );
}

const roleLabel = (id: EnergyModuleId, role: string) =>
  role === 'net_power'
    ? `Netto (+ ${id === 'grid' ? 'prelievo' : 'scarica'})`
    : MODULE_META[id].roles.find((spec) => spec.role === role)?.label ?? role;

/** Technical view: every measured or derived value with its entities and origin. */
function TechnicalDetails({ state }: { state: EnergyState }) {
  const absent = state.absent_modules.filter((id) => id !== 'home').map((id) => MODULE_META[id].label);
  return (
    <section aria-labelledby="energy-system-title" className="space-y-4">
      <h3 id="energy-system-title" className={EYEBROW}>Il tuo impianto</h3>
      <ul className="grid gap-4 md:grid-cols-2">
        {(Object.entries(state.modules) as Array<[EnergyModuleId, EnergyModuleState]>).map(([id, module]) => (
          <li key={id} className="space-y-1.5">
            <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {MODULE_META[id].label} <span className="text-[10px] font-semibold text-[color:var(--ui-text-tertiary)]">{module.status === 'offline' ? 'Offline' : module.complete ? 'Attivo' : 'Dati parziali'}</span>
            </p>
            {Object.entries(module.quantities)
              .filter(([, quantity]) => quantity.status !== 'not_measured')
              .map(([role, quantity]) => <Row key={role} label={roleLabel(id, role)} quantity={quantity} entities />)}
          </li>
        ))}
      </ul>
      <Row label="Consumo della casa" quantity={state.home_consumption} entities />
      {absent.length ? <p className={MUTED}>Non presenti: {absent.join(', ')}</p> : null}
    </section>
  );
}

function ModuleCard({ id, icon: Icon, accent, module }: { id: EnergyModuleId; icon: LucideIcon; accent: string; module: EnergyModuleState }) {
  const q = module.quantities;
  const offline = module.status === 'offline';
  const soc = okValue(q.state_of_charge);
  const flow = okValue(q.net_power);
  let main = formatQuantity(q.production_power ?? q.charging_power ?? q.net_power ?? q.import_power);
  let detail: React.ReactNode = null;
  if (id === 'grid') {
    main = flow === null ? formatQuantity(q.import_power) : formatPower(Math.abs(flow));
    detail = (
      <>
        <Row label="Prelievo" quantity={q.import_power} />
        <Row label="Immissione" quantity={q.export_power} />
      </>
    );
  } else if (id === 'battery') {
    main = soc !== null ? `${Math.round(soc)}%` : flow === null ? '—' : formatPower(Math.abs(flow));
    detail = (
      <>
        {soc === null ? null : (
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ui-fill-tertiary)]">
            <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${soc}%` }} />
          </div>
        )}
        <p className={MUTED}>
          {flow === null ? describeQuantity(q.net_power) : Math.abs(flow) < 10 ? 'In attesa' : `${flow > 0 ? 'In scarica' : 'In carica'} · ${formatPower(Math.abs(flow))}`}
        </p>
      </>
    );
  } else {
    const quantity = q.production_power ?? q.charging_power;
    detail = <p className={MUTED}>{id === 'wallbox' && okValue(quantity) !== null && (okValue(quantity) ?? 0) < 10 ? 'Nessuna ricarica in corso' : describeQuantity(quantity)}</p>;
  }
  return (
    <article className={`${CARD} ${offline ? 'border-dashed' : ''}`}>
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 ${offline ? 'text-[color:var(--ui-text-tertiary)]' : accent}`} aria-hidden="true" />
        <p className={EYEBROW}>{MODULE_META[id].label}</p>
        <span className={`ml-auto text-[10px] font-semibold ${offline ? 'text-amber-500' : 'text-[color:var(--ui-text-tertiary)]'}`}>
          {offline ? 'Offline' : module.complete ? 'Attivo' : 'Dati parziali'}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-[color:var(--ui-text-primary)]">{offline ? '—' : main}</p>
      <div className="mt-2 space-y-1.5">
        {offline ? <p className={MUTED}>Configurato: i sensori non forniscono dati in questo momento.</p> : detail}
      </div>
    </article>
  );
}

function HistoryCard({ state }: { state: EnergyState }) {
  const [period, setPeriod] = React.useState<HistoryPeriod>('24h');
  const series = [
    state.modules.solar ? 'Produzione fotovoltaica' : null,
    'Consumo della casa',
    state.modules.grid ? 'Prelievo dalla rete' : null,
    state.modules.grid ? 'Immissione in rete' : null,
    state.modules.battery ? 'Carica e scarica batteria' : null,
  ].filter((item): item is string => Boolean(item));
  const daily = [
    state.modules.solar ? 'Prodotta' : null,
    'Consumata',
    state.modules.grid ? 'Prelevata' : null,
    state.modules.grid ? 'Immessa' : null,
  ].filter((item): item is string => Boolean(item));
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
          onChange={(value) => setPeriod(value as HistoryPeriod)}
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
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {daily.map((item) => (
          <div key={item} className="rounded-[1.1rem] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5">
            <dt className={EYEBROW}>{item} oggi</dt>
            <dd className="mt-1 text-lg font-semibold text-[color:var(--ui-text-primary)]">— <span className="text-[10px] font-normal text-[color:var(--ui-text-tertiary)]">kWh</span></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AnalysisCard({ state }: { state: EnergyState }) {
  const solar = Boolean(state.modules.solar);
  const history = 'Richiede lo storico energetico';
  const rows: Array<[LucideIcon, string, string] | null> = [
    solar ? [Gauge, 'Autoconsumo', history] : null,
    solar || state.modules.battery ? [Leaf, 'Autosufficienza', history] : null,
    [TrendingUp, 'Costi energetici', 'Tariffa non configurata'],
    solar ? [TrendingDown, 'Risparmio stimato', 'Richiede tariffa e storico'] : null,
    [CalendarClock, 'Confronto con i periodi precedenti', history],
  ];
  return (
    <section className={CARD} aria-labelledby="energy-analysis-title">
      <p className={EYEBROW}>Analisi</p>
      <h2 id="energy-analysis-title" className={TITLE}>Bilancio e costi</h2>
      <ul className="mt-4 divide-y divide-[color:var(--ui-separator)]">
        {rows.filter((row): row is [LucideIcon, string, string] => Boolean(row)).map(([Icon, label, status]) => (
          <li key={label} className="flex items-center gap-3 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-medium text-[color:var(--ui-text-primary)]">{label}</span>
            <span className="text-right text-[10px] text-[color:var(--ui-text-tertiary)]">{status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mobile cards sit on the sheet; from md they join the page grid like Irrigation. */
const SECTION = 'mx-3 mb-3 md:mx-0 md:mb-0';
const PROGRESS = 'var(--energy-scroll-progress)';

function EnergyHero({ state }: { state: EnergyState }) {
  const status = energySystemStatus(state);
  const home = state.home_consumption;
  return (
    <div
      data-testid="energy-hero"
      className="relative flex h-[clamp(31rem,74svh,37rem)] flex-col overflow-hidden bg-[#10151b] text-white md:h-full md:min-h-[38rem] md:rounded-[2rem]"
    >
      <div
        className="absolute inset-x-0 bottom-28 top-[calc(env(safe-area-inset-top)+9.5rem)] [will-change:transform] motion-reduce:!transform-none md:bottom-12 md:top-36 md:!transform-none"
        style={{ transform: `translate3d(0, calc(${PROGRESS} * 18px), 0) scale(calc(1.045 - ${PROGRESS} * 0.045))`, transformOrigin: 'center top' }}
      >
        <EnergyHomeVisual state={state} view={buildFlowFromState(state)} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black motion-reduce:hidden md:hidden" style={{ opacity: `calc(${PROGRESS} * 0.5)` }} />
      <div
        className="relative z-10 px-4 pt-[calc(env(safe-area-inset-top)+5.25rem)] motion-reduce:!transform-none motion-reduce:!opacity-100 md:!transform-none md:!opacity-100 md:p-7 lg:p-8"
        style={{ opacity: `calc(1 - ${PROGRESS} * 1.15)`, transform: `translate3d(0, calc(${PROGRESS} * -24px), 0)` }}
      >
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
          Domus Energy · {status.label}
        </p>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <h2 id="energy-hero-title" className="min-w-0 text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[2.4rem]">{headline(state)}</h2>
          <div className="shrink-0 text-right">
            <p className="text-[2.3rem] font-light leading-none tracking-[-0.06em] sm:text-5xl">{formatQuantity(home)}</p>
            <p className="mt-1 text-[11px] font-medium text-white/70">Casa · {describeQuantity(home)}</p>
          </div>
        </div>
      </div>
      <p className="relative z-10 mt-auto hidden px-7 pb-6 text-[10px] text-white/50 md:block lg:px-8">
        Valori istantanei · Misurato = sensore · Derivato = calcolo Domus
      </p>
    </div>
  );
}

export function EnergyDashboard({
  state,
  banner,
  actions,
}: {
  state: EnergyState;
  banner?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const home = state.home_consumption;
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
      className="relative isolate grid min-h-full grid-cols-1 content-start bg-[color:var(--ui-bg-grouped)] pb-6 max-md:-mt-[calc(env(safe-area-inset-top)+4.65rem)] md:gap-5 md:bg-transparent md:px-6 md:pt-2 lg:px-8 xl:grid-cols-12 xl:px-10"
      style={{ '--energy-scroll-progress': 0 } as React.CSSProperties}
    >
      <section className="sticky top-0 z-0 md:static xl:col-span-8" aria-labelledby="energy-hero-title">
        <EnergyHero state={state} />
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

        <div className={`${SECTION} grid content-start gap-3 sm:grid-cols-2 md:gap-5 xl:col-span-4 xl:grid-cols-1`} aria-label="Componenti dell’impianto" role="list">
          {present.map((item) => (
            <div key={item.id} role="listitem">
              <ModuleCard {...item} module={state.modules[item.id] as EnergyModuleState} />
            </div>
          ))}
          <article role="listitem" className={`${CARD} ${present.length % 2 ? '' : 'sm:col-span-2 xl:col-span-1'}`}>
            <div className="flex items-center gap-2.5">
              <Home className="h-4 w-4 text-[color:var(--ui-text-secondary)]" aria-hidden="true" />
              <p className={EYEBROW}>Consumo della casa</p>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.045em] text-[color:var(--ui-text-primary)]">{formatQuantity(home)}</p>
            <p className={`mt-1 ${MUTED}`}>
              {home?.status === 'ok'
                ? home.source === 'derived' ? 'Derivato dal bilancio dell’impianto' : 'Misurato da un sensore dedicato'
                : describeQuantity(home)}
            </p>
          </article>
        </div>

        <div className={`${SECTION} xl:col-span-8`}><HistoryCard state={state} /></div>
        <div className={`${SECTION} xl:col-span-4`}><AnalysisCard state={state} /></div>

        <details className={`group ${CARD} !p-0 ${SECTION} xl:col-span-12`} data-testid="energy-technical-details">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">Dettagli sensori e configurazione</p>
              <p className={`mt-0.5 ${MUTED}`}>Entità, origine dei valori e motivi di indisponibilità</p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-[color:var(--ui-text-tertiary)] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-4 border-t border-[color:var(--ui-separator)] px-4 py-4 sm:px-5">
            <TechnicalDetails state={state} />
            {actions}
          </div>
        </details>
      </div>
    </div>
  );
}
