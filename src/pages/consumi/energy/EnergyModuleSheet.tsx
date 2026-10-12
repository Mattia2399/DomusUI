import GlassBottomSheet from '../../../components/ui/GlassBottomSheet';
import type { EnergyModuleId, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import { MODULE_META, formatAge, formatPower, formatQuantity, staleSince } from './energyModel';
import { MAIN_ROLE, deviceRows, hasDeviceDetail, moduleCondition, partialLine, quantityLabel, totalRow, type DeviceRow } from './energyDevicesModel';
import { translateConsumption, useConsumptionCopy } from '../../../i18n/consumptionCopy';
import type { AppLocale } from '../../../i18n/I18nProvider';

/* Details of one component (or the home), opened from its tile: live values, flows and sensors. The period history is in the Andamento section. */

const formatEuro = (value: number, locale: AppLocale) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const okValue = (quantity: EnergyQuantity | undefined | null) =>
  quantity?.status === 'ok' ? quantity.value : null;

/** Where a value comes from (measured, a sum of devices, a total sensor…) or why it is missing. */
export const describeQuantity = (quantity: EnergyQuantity | undefined | null, locale: AppLocale = 'it') => quantityLabel(quantity, locale);

const roleLabel = (id: EnergyModuleId, role: string, locale: AppLocale) =>
  role === 'net_power'
    ? translateConsumption(locale, id === 'grid' ? 'Netto (+ prelievo)' : 'Netto (+ scarica)')
    : (() => {
        const label = MODULE_META[id].roles.find((spec) => spec.role === role)?.label;
        return label ? translateConsumption(locale, label) : role;
      })();

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
  const { c, locale } = useConsumptionCopy();
  return (
    <div className="py-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[color:var(--ui-text-secondary)]">{label}</span>
        <span className="text-right font-semibold text-[color:var(--ui-text-primary)]">
          {formatQuantity(quantity, locale)} <span className="font-normal text-[color:var(--ui-text-tertiary)]">· {describeQuantity(quantity, locale)}</span>
          {quantity.freshness === 'stale' ? (
            <span className="block font-normal text-[color:var(--ui-warning)]">{c('Non aggiornato {age}', { age: formatAge(quantity.reported_at, now, locale) })}</span>
          ) : null}
        </span>
      </div>
      {quantity.entity_ids.length ? <p className="mt-0.5 break-all font-mono text-[10px] text-[color:var(--ui-text-tertiary)]">{quantity.entity_ids.join(', ')}</p> : null}
    </div>
  );
}

const TONE: Record<DeviceRow['tone'], string> = {
  ok: 'text-[color:var(--ui-text-secondary)]',
  warning: 'text-[color:var(--ui-warning)]',
  muted: 'text-[color:var(--ui-text-tertiary)]',
};

/** The total sensor and each device: a compact line that opens on its own sensors. */
function Devices({ total, rows, now }: { total: DeviceRow | null; rows: DeviceRow[]; now: string }) {
  const { c } = useConsumptionCopy();
  const items = total ? [total, ...rows] : rows;
  return (
    <section className="space-y-1.5" aria-label={c('Dispositivi')}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{c('Dispositivi')}</h3>
      <ul className="divide-y divide-[color:var(--ui-separator)] rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-3.5">
        {items.map((row) => (
          <li key={row.key}>
            <details className="group py-2.5">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[color:var(--ui-text-primary)]">{row.name}</span>
                  <span className={`block text-[11px] ${TONE[row.tone]}`}>{row.caption}</span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{row.value}</span>
              </summary>
              <div className="mt-1 divide-y divide-[color:var(--ui-separator)] border-t border-[color:var(--ui-separator)]">
                {row.quantities.map(([label, quantity]) => <Sensor key={label} label={label} quantity={quantity} now={now} />)}
                {row.convention ? <p className="py-2 text-[10px] text-[color:var(--ui-text-tertiary)]">{row.convention}</p> : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {total ? (
        <p className="px-1 text-[10px] leading-4 text-[color:var(--ui-text-tertiary)]">
          {c('Il sensore totale misura l’intero modulo: i dispositivi sono solo il dettaglio e non vengono sommati a esso.')}
        </p>
      ) : null}
    </section>
  );
}

/** A module value from several devices that is missing: what the reporting ones give, never as the total. */
function withDetail(id: EnergyModuleId, state: EnergyState, now: Line[], locale: AppLocale) {
  if (id === 'home') {
    const partial = partialLine('home', 'consumption_power', state.home_consumption, locale);
    return partial ? [...now, partial] : now;
  }
  const q = state.modules[id]?.quantities ?? {};
  const lines = [...now];
  const partial = partialLine(id, MAIN_ROLE[id], q[MAIN_ROLE[id]], locale);
  if (partial) lines.push(partial);
  const soc = q.state_of_charge;
  if (id === 'battery' && hasDeviceDetail(state.modules.battery) && soc && soc.status !== 'ok') {
    lines.unshift([translateConsumption(locale, 'Stato di carica complessivo'), quantityLabel(soc, locale)]);
  }
  return lines;
}

/** Live figures and flows of one component, with whether the flows are only estimated. */
function liveLines(id: EnergyModuleId, state: EnergyState, locale: AppLocale): { now: Line[]; flows: Line[]; estimated: boolean; note?: string } {
  const flows = liveFlows(state);
  const kw = (value: number) => formatPower(value, locale);
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
    now.push([translateConsumption(locale, 'Produzione'), production === null ? describeQuantity(q.production_power, locale) : kw(production)]);
    if (flows && flows.supply.solar > 0) {
      flow(translateConsumption(locale, 'Verso la casa'), part(flows, 'solar', 'home'));
      if (has('battery')) flow(translateConsumption(locale, 'Verso la batteria'), part(flows, 'solar', 'battery'));
      if (has('grid')) flow(translateConsumption(locale, 'Verso la rete'), part(flows, 'solar', 'grid'));
    }
  } else if (id === 'grid') {
    const net = okValue(q.net_power);
    now.push([translateConsumption(locale, net !== null && net < 0 ? 'Immissione' : 'Prelievo'), net === null ? describeQuantity(q.net_power, locale) : kw(Math.abs(net))]);
    const tariff = state.tariff;
    if (tariff) {
      now.push([translateConsumption(locale, 'Fascia attuale'), `${tariff.band_label} · ${tariff.price.toLocaleString(locale, { maximumFractionDigits: 4 })} €/kWh`]);
      // Energy price only: the fixed fee has no hourly meaning. Prices exclude VAT when a rate is set.
      const vat = tariff.vat_percent ? 1 + tariff.vat_percent / 100 : 1;
      if (net !== null && net > 0) {
        now.push([translateConsumption(locale, tariff.vat_percent ? 'Costo attuale stimato, IVA inclusa' : 'Costo attuale stimato'), `≈ ${formatEuro((net / 1000) * tariff.price * vat, locale)}/h`]);
      }
      if (net !== null && net < 0 && tariff.export_price) now.push([translateConsumption(locale, 'Valore immissione stimato'), `≈ ${formatEuro((-net / 1000) * tariff.export_price, locale)}/h`]);
    }
    if (flows && flows.supply.grid > 0) {
      flow(translateConsumption(locale, 'Alla casa'), part(flows, 'grid', 'home'));
      if (has('battery')) flow(translateConsumption(locale, 'Alla batteria'), part(flows, 'grid', 'battery'));
    } else if (flows && flows.sink.grid > 0) {
      if (has('solar')) flow(translateConsumption(locale, 'Dal fotovoltaico'), part(flows, 'solar', 'grid'));
      if (has('battery')) flow(translateConsumption(locale, 'Dalla batteria'), part(flows, 'battery', 'grid'));
    }
  } else if (id === 'battery') {
    const soc = okValue(q.state_of_charge);
    const net = okValue(q.net_power);
    if (soc !== null) now.push([translateConsumption(locale, 'Stato di carica'), `${Math.round(soc)}%`]);
    now.push([translateConsumption(locale, net !== null && net < 0 ? 'In carica' : 'In scarica'), net === null ? describeQuantity(q.net_power, locale) : kw(Math.abs(net))]);
    if (flows && flows.sink.battery > 0) {
      if (has('solar')) flow(translateConsumption(locale, 'Dal fotovoltaico'), part(flows, 'solar', 'battery'));
      flow(translateConsumption(locale, 'Dalla rete'), part(flows, 'grid', 'battery'));
    } else if (flows && flows.supply.battery > 0) {
      flow(translateConsumption(locale, 'Alla casa'), part(flows, 'battery', 'home'));
      if (has('grid')) flow(translateConsumption(locale, 'Alla rete'), part(flows, 'battery', 'grid'));
    }
  } else if (id === 'wallbox') {
    const charging = okValue(q.charging_power);
    now.push([translateConsumption(locale, 'Potenza di ricarica'), charging === null ? describeQuantity(q.charging_power, locale) : kw(charging)]);
    // The wallbox is behind the meter: it can only be given the same mix as the rest of the home.
    if (flows && charging !== null && charging > 0) {
      (['solar', 'battery', 'grid'] as const).filter(has).forEach((side) => {
        flow(translateConsumption(locale, 'Da {source}', { source: translateConsumption(locale, MODULE_META[side].label).toLocaleLowerCase(locale) }), (flows.supply[side] * charging) / flows.total, charging);
      });
      const mixed = (['solar', 'battery', 'grid'] as const).filter((side) => flows.supply[side] > 0).length > 1;
      if (mixed) {
        return { now: withDetail(id, state, now, locale), flows: out, estimated: true, note: translateConsumption(locale, 'Stima: la wallbox riceve lo stesso mix del resto della casa, perché i contatori non distinguono i singoli carichi.') };
      }
    }
  } else {
    const home = okValue(state.home_consumption);
    now.push([translateConsumption(locale, 'Consumo'), home === null ? describeQuantity(state.home_consumption, locale) : kw(home)]);
    const charging = okValue(state.modules.wallbox?.quantities.charging_power);
    if (charging !== null && charging > 0) now.push([translateConsumption(locale, 'Di cui ricarica auto'), kw(charging)]);
    if (flows && home !== null) {
      (['solar', 'battery', 'grid'] as const).filter(has).forEach((side) => {
        flow(translateConsumption(locale, 'Da {source}', { source: translateConsumption(locale, MODULE_META[side].label).toLocaleLowerCase(locale) }), part(flows, side, 'home'), home);
      });
    }
  }
  return { now: withDetail(id, state, now, locale), flows: out, estimated: Boolean(flows?.estimated) };
}

export function EnergyModuleSheet({
  id,
  state,
  onClose,
  onEdit,
}: {
  id: EnergyModuleId | null;
  state: EnergyState;
  onClose: () => void;
  onEdit?: (id: EnergyModuleId) => void;
}) {
  const { c, locale } = useConsumptionCopy();
  const module = id && id !== 'home' ? state.modules[id] : undefined;
  const live = id ? liveLines(id, state, locale) : null;
  // The home sheet also lists the home meters when there are several.
  const detailModule = id ? state.modules[id] : undefined;
  const detail = id && hasDeviceDetail(detailModule) && detailModule ? {
    total: totalRow(id, detailModule.total, state.observed_at, locale),
    rows: deviceRows(id, detailModule, state.observed_at, locale),
  } : null;
  const condition = module && id ? moduleCondition(id, module) : 'complete';
  const status = !module
    ? null
    : module.status === 'offline'
      ? c('Offline · i sensori non forniscono dati')
      : module.freshness === 'stale'
        ? c('Non aggiornato {age}', { age: formatAge(staleSince(module.quantities), state.observed_at, locale) })
        : condition === 'complete' ? c('Attivo') : condition === 'detail_incomplete' ? c('Attivo · dettaglio dei dispositivi incompleto') : c('Dati parziali');
  const sensors = id === 'home'
    ? (state.home_consumption ? [[c('Consumo della casa'), state.home_consumption] as const] : [])
    : Object.entries(module?.quantities ?? {}).filter(([, quantity]) => quantity.status !== 'not_measured').map(([role, quantity]) => [roleLabel(id as EnergyModuleId, role, locale), quantity] as const);
  const convention = id && id !== 'home' && module?.sign_convention
    ? (() => {
        const text = MODULE_META[id].conventions?.find(([value]) => value === module.sign_convention)?.[1];
        return text ? c(text) : undefined;
      })()
    : undefined;

  return (
    <GlassBottomSheet
      isOpen={id !== null}
      onClose={onClose}
      title={id === 'home' ? c('Consumo della casa') : id ? c(MODULE_META[id].label) : ''}
      description={status ?? undefined}
      showCloseButton
      footer={id && onEdit ? (
        <button type="button" onClick={() => onEdit(id)} className="liquid-glass-control flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold text-[color:var(--ui-text-primary)]">
          {c('Modifica sensori')}
        </button>
      ) : undefined}
    >
      {id && live ? (
        <div className="space-y-5 text-left">
          <Lines title={c('Adesso')} lines={live.now} />
          {live.flows.length ? (
            <div className="space-y-1.5">
              <Lines title={live.estimated ? c('Flussi · stimati') : c('Flussi · calcolati')} lines={live.flows} />
              <p className="px-1 text-[10px] leading-4 text-[color:var(--ui-text-tertiary)]">
                {live.note ?? (live.estimated
                  ? c('Stima in proporzione: con più sorgenti attive insieme i contatori non dicono quale energia va dove.')
                  : c('Calcolati dai contatori: in questa situazione ogni percorso è determinato.'))}
              </p>
            </div>
          ) : null}
          {detail ? <Devices total={detail.total} rows={detail.rows} now={state.observed_at} /> : null}
          {sensors.length ? (
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{detail ? c('Valori del modulo') : c('Sensori')}</h3>
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
