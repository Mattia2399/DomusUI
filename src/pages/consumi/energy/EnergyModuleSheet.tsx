import GlassBottomSheet from '../../../components/ui/GlassBottomSheet';
import type { EnergyHistory, EnergyHistorySeriesId, EnergyModuleId, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { EnergyHistoryChart } from './EnergyHistoryChart';
import { MODULE_META, REASON_LABEL, SOURCE_LABEL, formatAge, formatPower, formatQuantity, staleSince } from './energyModel';
import { formatEuro, formatKwh, historyBalance, seriesTotal } from './energyHistoryModel';

/* Details of one component (or the home), opened from its tile: live values, flows, history and sensors. */

export const okValue = (quantity: EnergyQuantity | undefined | null) =>
  quantity?.status === 'ok' ? quantity.value : null;

export const describeQuantity = (quantity: EnergyQuantity | undefined | null) =>
  quantity?.status === 'ok' && quantity.source ? SOURCE_LABEL[quantity.source] : REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile';

const roleLabel = (id: EnergyModuleId, role: string) =>
  role === 'net_power'
    ? `Netto (+ ${id === 'grid' ? 'prelievo' : 'scarica'})`
    : MODULE_META[id].roles.find((spec) => spec.role === role)?.label ?? role;

type Side = 'solar' | 'battery' | 'grid';
export type LiveFlows = {
  supply: Record<Side, number>;
  sink: { home: number; battery: number; grid: number };
  total: number;
  /** True when the paths cannot be told from the meters and are split in proportion. */
  estimated: boolean;
};

/**
 * Live supplies (solar, battery discharge, grid import) and sinks (home, battery charge, export).
 * Meters give totals, not paths. The paths are fixed whenever one supply or one destination
 * besides the home is involved; they are a proportional estimate only when solar and the grid
 * both feed while the battery charges, or solar and the battery both feed while power is
 * exported. Null when any present source is unknown.
 */
export function liveFlows(state: EnergyState): LiveFlows | null {
  const home = okValue(state.home_consumption);
  const grid = okValue(state.modules.grid?.quantities.net_power);
  const solar = state.modules.solar ? okValue(state.modules.solar.quantities.production_power) : 0;
  const battery = state.modules.battery ? okValue(state.modules.battery.quantities.net_power) : 0;
  if (home === null || grid === null || solar === null || battery === null) return null;
  const supply = { solar: Math.max(solar, 0), battery: Math.max(battery, 0), grid: Math.max(grid, 0) };
  const total = supply.solar + supply.battery + supply.grid;
  if (total <= 0) return null;
  const sink = { home: Math.max(home, 0), battery: Math.max(-battery, 0), grid: Math.max(-grid, 0) };
  const estimated = (supply.solar > 0 && supply.grid > 0 && sink.battery > 0) || (supply.solar > 0 && supply.battery > 0 && sink.grid > 0);
  return { supply, sink, total, estimated };
}

const part = (flows: LiveFlows, from: Side, to: keyof LiveFlows['sink']) => (flows.supply[from] * flows.sink[to]) / flows.total;

const SERIES: Partial<Record<EnergyModuleId, EnergyHistorySeriesId[]>> = {
  solar: ['production'],
  grid: ['import', 'export'],
  battery: ['battery_discharge', 'battery_charge'],
  home: ['consumption'],
};

type Line = [string, string];

function Lines({ title, lines }: { title: string; lines: Line[] }) {
  if (!lines.length) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{title}</h3>
      <dl className="divide-y divide-[color:var(--ui-separator)] rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-3.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
            <dt className="text-[color:var(--ui-text-secondary)]">{label}</dt>
            <dd className="text-right font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Sensor({ label, quantity, now }: { label: string; quantity: EnergyQuantity; now: string }) {
  return (
    <div className="py-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[color:var(--ui-text-secondary)]">{label}</span>
        <span className="text-right font-semibold text-[color:var(--ui-text-primary)]">
          {formatQuantity(quantity)} <span className="font-normal text-[color:var(--ui-text-tertiary)]">· {describeQuantity(quantity)}</span>
          {quantity.freshness === 'stale' ? (
            <span className="block font-normal text-[color:var(--ui-warning)]">Non aggiornato {formatAge(quantity.reported_at, now)}</span>
          ) : null}
        </span>
      </div>
      {quantity.entity_ids.length ? <p className="mt-0.5 break-all font-mono text-[10px] text-[color:var(--ui-text-tertiary)]">{quantity.entity_ids.join(', ')}</p> : null}
    </div>
  );
}

/** Live figures and flows of one component, with whether the flows are only estimated. */
function liveLines(id: EnergyModuleId, state: EnergyState): { now: Line[]; flows: Line[]; estimated: boolean; note?: string } {
  const flows = liveFlows(state);
  const kw = (value: number) => formatPower(value);
  const share = (value: number, whole: number) => (whole > 0 ? ` · ${Math.round((value / whole) * 100)}%` : '');
  const has = (module: EnergyModuleId) => Boolean(state.modules[module]);
  const now: Line[] = [];
  const out: Line[] = [];
  // Only paths that actually carry power are listed.
  const flow = (label: string, value: number, whole?: number) => {
    if (value >= 10) out.push([label, kw(value) + (whole === undefined ? '' : share(value, whole))]);
  };
  const q = state.modules[id]?.quantities ?? {};
  if (id === 'solar') {
    const production = okValue(q.production_power);
    now.push(['Produzione', production === null ? describeQuantity(q.production_power) : kw(production)]);
    if (flows && flows.supply.solar > 0) {
      flow('Verso la casa', part(flows, 'solar', 'home'));
      if (has('battery')) flow('Verso la batteria', part(flows, 'solar', 'battery'));
      if (has('grid')) flow('Verso la rete', part(flows, 'solar', 'grid'));
    }
  } else if (id === 'grid') {
    const net = okValue(q.net_power);
    now.push([net !== null && net < 0 ? 'Immissione' : 'Prelievo', net === null ? describeQuantity(q.net_power) : kw(Math.abs(net))]);
    const tariff = state.tariff;
    if (tariff) {
      now.push(['Fascia attuale', `${tariff.band_label} · ${tariff.price.toLocaleString('it-IT', { maximumFractionDigits: 4 })} €/kWh`]);
      // Energy price only: the fixed fee has no hourly meaning. Prices exclude VAT when a rate is set.
      const vat = tariff.vat_percent ? 1 + tariff.vat_percent / 100 : 1;
      if (net !== null && net > 0) {
        now.push([tariff.vat_percent ? 'Costo attuale stimato, IVA inclusa' : 'Costo attuale stimato', `≈ ${formatEuro((net / 1000) * tariff.price * vat)}/h`]);
      }
      if (net !== null && net < 0 && tariff.export_price) now.push(['Valore immissione stimato', `≈ ${formatEuro((-net / 1000) * tariff.export_price)}/h`]);
    }
    if (flows && flows.supply.grid > 0) {
      flow('Alla casa', part(flows, 'grid', 'home'));
      if (has('battery')) flow('Alla batteria', part(flows, 'grid', 'battery'));
    } else if (flows && flows.sink.grid > 0) {
      if (has('solar')) flow('Dal fotovoltaico', part(flows, 'solar', 'grid'));
      if (has('battery')) flow('Dalla batteria', part(flows, 'battery', 'grid'));
    }
  } else if (id === 'battery') {
    const soc = okValue(q.state_of_charge);
    const net = okValue(q.net_power);
    if (soc !== null) now.push(['Stato di carica', `${Math.round(soc)}%`]);
    now.push([net !== null && net < 0 ? 'In carica' : 'In scarica', net === null ? describeQuantity(q.net_power) : kw(Math.abs(net))]);
    if (flows && flows.sink.battery > 0) {
      if (has('solar')) flow('Dal fotovoltaico', part(flows, 'solar', 'battery'));
      flow('Dalla rete', part(flows, 'grid', 'battery'));
    } else if (flows && flows.supply.battery > 0) {
      flow('Alla casa', part(flows, 'battery', 'home'));
      if (has('grid')) flow('Alla rete', part(flows, 'battery', 'grid'));
    }
  } else if (id === 'wallbox') {
    const charging = okValue(q.charging_power);
    now.push(['Potenza di ricarica', charging === null ? describeQuantity(q.charging_power) : kw(charging)]);
    // The wallbox is behind the meter: it can only be given the same mix as the rest of the home.
    if (flows && charging !== null && charging > 0) {
      (['solar', 'battery', 'grid'] as const).filter(has).forEach((side) => {
        flow(`Da ${MODULE_META[side].label.toLowerCase()}`, (flows.supply[side] * charging) / flows.total, charging);
      });
      const mixed = (['solar', 'battery', 'grid'] as const).filter((side) => flows.supply[side] > 0).length > 1;
      if (mixed) {
        return { now, flows: out, estimated: true, note: 'Stima: la wallbox riceve lo stesso mix del resto della casa, perché i contatori non distinguono i singoli carichi.' };
      }
    }
  } else {
    const home = okValue(state.home_consumption);
    now.push(['Consumo', home === null ? describeQuantity(state.home_consumption) : kw(home)]);
    const charging = okValue(state.modules.wallbox?.quantities.charging_power);
    if (charging !== null && charging > 0) now.push(['Di cui ricarica auto', kw(charging)]);
    if (flows && home !== null) {
      (['solar', 'battery', 'grid'] as const).filter(has).forEach((side) => {
        flow(`Da ${MODULE_META[side].label.toLowerCase()}`, part(flows, side, 'home'), home);
      });
    }
  }
  return { now, flows: out, estimated: Boolean(flows?.estimated) };
}

function historyLines(id: EnergyModuleId, history: EnergyHistory): Line[] {
  const total = (series: EnergyHistorySeriesId) => `${formatKwh(seriesTotal(history, series))} kWh`;
  if (id === 'solar') {
    const balance = historyBalance(history);
    return [['Prodotta', total('production')], ...(balance.selfConsumption === null ? [] : [['Usata in casa', `${Math.round(balance.selfConsumption * 100)}%`] as Line])];
  }
  if (id === 'grid') return [['Prelevata', total('import')], ['Immessa', total('export')]];
  if (id === 'battery') return [['Scaricata', total('battery_discharge')], ['Caricata', total('battery_charge')]];
  if (id === 'home') return [['Consumata', total('consumption')]];
  return [];
}

export function EnergyModuleSheet({
  id,
  state,
  history,
  onClose,
  onEdit,
}: {
  id: EnergyModuleId | null;
  state: EnergyState;
  history?: EnergyHistory;
  onClose: () => void;
  onEdit?: (id: EnergyModuleId) => void;
}) {
  const module = id && id !== 'home' ? state.modules[id] : undefined;
  const live = id ? liveLines(id, state) : null;
  const series = (id && SERIES[id]?.filter((name) => history?.series[name]?.length)) ?? [];
  const status = !module
    ? null
    : module.status === 'offline'
      ? 'Offline · i sensori non forniscono dati'
      : module.freshness === 'stale'
        ? `Non aggiornato ${formatAge(staleSince(module.quantities), state.observed_at)}`
        : module.complete ? 'Attivo' : 'Dati parziali';
  const sensors = id === 'home'
    ? (state.home_consumption ? [['Consumo della casa', state.home_consumption] as const] : [])
    : Object.entries(module?.quantities ?? {}).filter(([, quantity]) => quantity.status !== 'not_measured').map(([role, quantity]) => [roleLabel(id as EnergyModuleId, role), quantity] as const);
  const convention = id && id !== 'home' && module?.sign_convention
    ? MODULE_META[id].conventions?.find(([value]) => value === module.sign_convention)?.[1]
    : undefined;

  return (
    <GlassBottomSheet
      isOpen={id !== null}
      onClose={onClose}
      title={id === 'home' ? 'Consumo della casa' : id ? MODULE_META[id].label : ''}
      description={status ?? undefined}
      showCloseButton
      footer={id && onEdit ? (
        <button type="button" onClick={() => onEdit(id)} className="liquid-glass-control flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-[color:var(--ui-text-primary)]">
          Modifica sensori
        </button>
      ) : undefined}
    >
      {id && live ? (
        <div className="space-y-5 text-left">
          <Lines title="Adesso" lines={live.now} />
          {live.flows.length ? (
            <div className="space-y-1.5">
              <Lines title={live.estimated ? 'Flussi · stimati' : 'Flussi · calcolati'} lines={live.flows} />
              <p className="px-1 text-[10px] leading-4 text-[color:var(--ui-text-tertiary)]">
                {live.note ?? (live.estimated
                  ? 'Stima in proporzione: con più sorgenti attive insieme i contatori non dicono quale energia va dove.'
                  : 'Calcolati dai contatori: in questa situazione ogni percorso è determinato.')}
              </p>
            </div>
          ) : null}
          {history && series.length ? (
            <section className="space-y-1.5">
              <Lines title="Ultime 24 ore" lines={historyLines(id, history)} />
              <EnergyHistoryChart history={{ ...history, series: Object.fromEntries(series.map((name) => [name, history.series[name]])) }} showAll />
            </section>
          ) : (
            <Lines title="Ultime 24 ore" lines={[['Storico', 'Richiede lo storico energetico']]} />
          )}
          {sensors.length ? (
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">Sensori</h3>
              <div className="divide-y divide-[color:var(--ui-separator)] rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-3.5">
                {sensors.map(([label, quantity]) => <Sensor key={label} label={label} quantity={quantity} now={state.observed_at} />)}
              </div>
              {convention ? <p className="px-1 text-[10px] text-[color:var(--ui-text-tertiary)]">{convention}</p> : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </GlassBottomSheet>
  );
}
