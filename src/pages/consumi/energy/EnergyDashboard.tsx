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
  SlidersHorizontal,
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

const CARD = 'rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5';
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

export function EnergyDashboard({
  state,
  canManage,
  onEdit,
  banner,
  actions,
}: {
  state: EnergyState;
  canManage: boolean;
  onEdit: () => void;
  banner?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const flow = buildFlowFromState(state);
  const status = energySystemStatus(state);
  const home = state.home_consumption;
  const present = MODULES.filter((item) => state.modules[item.id]);

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-3 sm:space-y-4" data-testid="energy-experience">
      {banner}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-12">
        <section
          className="relative isolate flex min-h-[38rem] flex-col overflow-hidden rounded-[2rem] bg-[#10151b] text-white shadow-[0_30px_80px_rgba(2,6,23,0.28)] sm:min-h-[44rem] xl:col-span-8"
          aria-labelledby="energy-hero-title"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_58%,rgba(56,189,248,0.1),transparent_46%)]" />
          <div className="relative z-10 flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7 lg:p-8">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                Domus Energy · {status.label}
              </p>
              <h2 id="energy-hero-title" className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-[-0.045em] sm:text-[2.4rem]">{headline(state)}</h2>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-[2.4rem] font-light leading-none tracking-[-0.06em] sm:text-5xl">{formatQuantity(home)}</p>
              <p className="mt-1 text-[11px] font-medium text-white/65">Casa · {describeQuantity(home)}</p>
            </div>
          </div>
          <div className="relative min-h-0 flex-1">
            <EnergyHomeVisual state={state} view={flow} />
          </div>
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-5 pb-5 text-[10px] text-white/50 sm:px-7 sm:pb-6">
            <span>Valori istantanei · Misurato = sensore · Derivato = calcolo Domus</span>
            {canManage ? (
              <button type="button" onClick={onEdit} className="flex min-h-9 items-center gap-1.5 rounded-full border border-white/18 bg-black/30 px-3 text-xs font-semibold text-white backdrop-blur-xl">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Impianto
              </button>
            ) : null}
          </div>
        </section>

        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:content-start sm:gap-4 sm:overflow-visible sm:pb-0 xl:col-span-4 xl:grid-cols-1" aria-label="Componenti dell’impianto" role="list">
          {present.map((item) => (
            <div key={item.id} role="listitem" className="w-[16.5rem] shrink-0 snap-start sm:w-auto">
              <ModuleCard {...item} module={state.modules[item.id] as EnergyModuleState} />
            </div>
          ))}
          <article role="listitem" className={`${CARD} w-[16.5rem] shrink-0 snap-start sm:col-span-2 sm:w-auto xl:col-span-1`}>
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

        <div className="xl:col-span-8"><HistoryCard state={state} /></div>
        <div className="xl:col-span-4"><AnalysisCard state={state} /></div>
      </div>

      <details className={`group ${CARD} !p-0`} data-testid="energy-technical-details">
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
  );
}
