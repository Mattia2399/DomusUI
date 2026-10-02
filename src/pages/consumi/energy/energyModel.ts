import type {
  EnergyModuleId,
  EnergyQuantity,
  EnergyState,
} from '../../../services/energyCoreClient';

export type EnergyRoleSpec = {
  role: string;
  label: string;
  /** Roles shown in each wiring mode; SoC is shown in both. */
  mode?: 'split' | 'net';
  soc?: boolean;
};

export type EnergyModuleMeta = {
  label: string;
  hint: string;
  roles: EnergyRoleSpec[];
  conventions?: Array<[string, string]>;
};

export const MODULE_META: Record<EnergyModuleId, EnergyModuleMeta> = {
  grid: {
    label: 'Rete',
    hint: 'Contatore di scambio con la rete elettrica',
    roles: [
      { role: 'import_power', label: 'Prelievo', mode: 'split' },
      { role: 'export_power', label: 'Immissione', mode: 'split' },
      { role: 'net_power', label: 'Potenza netta (con segno)', mode: 'net' },
    ],
    conventions: [
      ['positive_import', 'Valori positivi = prelievo dalla rete'],
      ['positive_export', 'Valori positivi = immissione in rete'],
    ],
  },
  solar: {
    label: 'Fotovoltaico',
    hint: 'Produzione istantanea dell’impianto solare',
    roles: [{ role: 'production_power', label: 'Produzione' }],
  },
  home: {
    label: 'Casa',
    hint: 'Sensore dedicato al consumo della casa',
    roles: [{ role: 'consumption_power', label: 'Consumo' }],
  },
  battery: {
    label: 'Batteria',
    hint: 'Sistema di accumulo',
    roles: [
      { role: 'state_of_charge', label: 'Stato di carica', soc: true },
      { role: 'charge_power', label: 'Potenza di carica', mode: 'split' },
      { role: 'discharge_power', label: 'Potenza di scarica', mode: 'split' },
      { role: 'net_power', label: 'Potenza netta (con segno)', mode: 'net' },
    ],
    conventions: [
      ['positive_discharge', 'Valori positivi = scarica verso la casa'],
      ['positive_charge', 'Valori positivi = carica della batteria'],
    ],
  },
  wallbox: {
    label: 'Wallbox',
    hint: 'Ricarica del veicolo elettrico',
    roles: [{ role: 'charging_power', label: 'Potenza di ricarica' }],
  },
};

/** Design-system class sets shared by the Energy page and its setup wizard. */
export const UI = {
  button: 'liquid-glass-control inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-40',
  primary: 'glass-button glass-button-primary inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-40',
  chip: 'liquid-glass-control inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs',
  card: 'rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3',
  title: 'font-semibold text-[color:var(--ui-text-primary)]',
  body: 'text-sm text-[color:var(--ui-text-secondary)]',
  muted: 'text-xs text-[color:var(--ui-text-tertiary)]',
  spin: 'h-4 w-4 animate-spin motion-reduce:animate-none',
};

/** Flows below this magnitude are shown as idle rather than animated. */
const FLOW_THRESHOLD_W = 10;

export function formatPower(watts: number) {
  const absolute = Math.abs(watts);
  if (absolute < 1000) {
    const rounded = Math.round(watts);
    return `${Object.is(rounded, -0) ? 0 : rounded.toLocaleString('it-IT')} W`;
  }
  return `${(watts / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kW`;
}

export function formatQuantity(quantity: Pick<EnergyQuantity, 'status' | 'value' | 'unit'> | null | undefined) {
  if (!quantity || quantity.status !== 'ok' || quantity.value === null) return '—';
  return quantity.unit === '%' ? `${Math.round(quantity.value)}%` : formatPower(quantity.value);
}

export const SOURCE_LABEL = { measured: 'Misurato', derived: 'Derivato' } as const;

export const REASON_LABEL: Record<string, string> = {
  not_configured: 'Nessun sensore',
  insufficient_data: 'Dati insufficienti',
  source_unavailable: 'Sensori non disponibili',
  source_invalid: 'Dati non validi',
  incoherent_balance: 'Bilancio incoerente',
  entity_missing: 'Entità non trovata',
  state_unavailable: 'Non disponibile',
  state_unknown: 'Valore sconosciuto',
  unexpected_negative: 'Valore negativo inatteso',
  cumulative_energy: 'È un contatore di energia, non di potenza',
  unsupported_unit: 'Unità non supportata',
  unit_missing: 'Unità mancante',
};

export type FlowDirection = 'in' | 'out' | 'idle';

export type FlowNodeView = {
  id: EnergyModuleId;
  label: string;
  value: string;
  caption?: string;
  online: boolean;
  direction: FlowDirection;
  amountW: number;
};

export type FlowView = {
  nodes: FlowNodeView[];
  home: { value: string; caption: string; online: boolean };
};

/** Direction of a signed flow where positive values enter the home. */
export function directionOf(inboundW: number | null): FlowDirection {
  if (inboundW === null || Math.abs(inboundW) < FLOW_THRESHOLD_W) return 'idle';
  return inboundW > 0 ? 'in' : 'out';
}

const okValue = (quantity: EnergyQuantity | undefined) =>
  quantity && quantity.status === 'ok' ? quantity.value : null;

/** Build the adaptive diagram from the backend projection only. */
export function buildFlowFromState(state: EnergyState): FlowView {
  const nodes: FlowNodeView[] = [];
  for (const id of ['grid', 'solar', 'battery', 'wallbox'] as EnergyModuleId[]) {
    const module = state.modules[id];
    if (!module) continue;
    const q = module.quantities;
    let inbound: number | null = null;
    let value = '—';
    let caption: string | undefined;
    if (id === 'grid') {
      inbound = okValue(q.net_power);
      value = inbound === null ? formatQuantity(q.import_power) : formatPower(Math.abs(inbound));
      caption = inbound === null ? undefined : inbound >= 0 ? 'Prelievo' : 'Immissione';
    } else if (id === 'solar') {
      inbound = okValue(q.production_power);
      value = formatQuantity(q.production_power);
    } else if (id === 'battery') {
      inbound = okValue(q.net_power);
      const soc = okValue(q.state_of_charge);
      const flow = inbound === null ? undefined : `${inbound >= 0 ? 'Scarica' : 'Carica'} ${formatPower(Math.abs(inbound))}`;
      value = soc !== null ? `${Math.round(soc)}%` : flow ?? '—';
      caption = soc !== null ? flow : undefined;
    } else {
      const charging = okValue(q.charging_power);
      inbound = charging === null ? null : -charging;
      value = formatQuantity(q.charging_power);
    }
    nodes.push({
      id,
      label: MODULE_META[id].label,
      value,
      caption: module.status === 'offline' ? 'Offline' : caption,
      online: module.status === 'online',
      direction: module.status === 'online' ? directionOf(inbound) : 'idle',
      amountW: Math.abs(inbound ?? 0),
    });
  }
  const consumption = state.home_consumption;
  const homeOk = consumption?.status === 'ok';
  return {
    nodes,
    home: {
      value: formatQuantity(consumption),
      caption: homeOk && consumption?.source
        ? SOURCE_LABEL[consumption.source]
        : REASON_LABEL[consumption?.reason ?? ''] ?? 'Non disponibile',
      online: homeOk,
    },
  };
}
