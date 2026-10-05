import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import type { EnergyCoreResource } from './useEnergyCore';
import { REASON_LABEL, formatPower } from './energyModel';

export type EnergyOverviewTone = 'neutral' | 'info' | 'success' | 'warning';

export type EnergyOverviewMetric = {
  key: 'home' | 'grid' | 'solar' | 'battery';
  value: string;
  label: string;
};

export type EnergyOverview = {
  notice: {
    label: string;
    text: string;
    tone: EnergyOverviewTone;
  };
  metrics: EnergyOverviewMetric[];
  cardMetrics: Array<{ value: string; label: string }>;
};

const unavailable = (label: string): EnergyOverviewMetric => ({
  key: 'home',
  value: '—',
  label,
});

function valueOf(quantity: EnergyQuantity | null | undefined) {
  return quantity?.status === 'ok' && quantity.value !== null ? quantity.value : null;
}

function unavailableReason(quantity: EnergyQuantity | null | undefined) {
  return REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile';
}

function homeMetric(state: EnergyState | null): EnergyOverviewMetric {
  const quantity = state?.home_consumption;
  const value = valueOf(quantity);
  if (value === null) {
    return unavailable(`Potenza casa · ${unavailableReason(quantity)}`);
  }
  return { key: 'home', value: formatPower(value), label: 'Potenza casa' };
}

function gridMetric(module: EnergyModuleState | undefined): EnergyOverviewMetric {
  if (!module) return { key: 'grid', value: '—', label: 'Rete non configurata' };
  if (module.status === 'offline') return { key: 'grid', value: '—', label: 'Rete offline' };

  const net = valueOf(module.quantities.net_power);
  if (net !== null) {
    return {
      key: 'grid',
      value: formatPower(Math.abs(net)),
      label: net > 0 ? 'Prelievo rete' : net < 0 ? 'Immissione rete' : 'Rete in equilibrio',
    };
  }
  const imported = valueOf(module.quantities.import_power);
  if (imported !== null) return { key: 'grid', value: formatPower(imported), label: 'Prelievo misurato' };
  const exported = valueOf(module.quantities.export_power);
  if (exported !== null) return { key: 'grid', value: formatPower(exported), label: 'Immissione misurata' };
  return { key: 'grid', value: '—', label: 'Potenza rete non disponibile' };
}

function solarMetric(module: EnergyModuleState | undefined): EnergyOverviewMetric {
  if (!module) return { key: 'solar', value: '—', label: 'Fotovoltaico non presente' };
  if (module.status === 'offline') return { key: 'solar', value: '—', label: 'Fotovoltaico offline' };
  const production = valueOf(module.quantities.production_power);
  return production === null
    ? { key: 'solar', value: '—', label: 'Produzione non disponibile' }
    : { key: 'solar', value: formatPower(production), label: 'Produzione fotovoltaica' };
}

function batteryMetric(module: EnergyModuleState | undefined): EnergyOverviewMetric {
  if (!module) return { key: 'battery', value: '—', label: 'Batteria non presente' };
  if (module.status === 'offline') return { key: 'battery', value: '—', label: 'Batteria offline' };

  const stateOfCharge = valueOf(module.quantities.state_of_charge);
  const net = valueOf(module.quantities.net_power);
  const flow = net === null
    ? 'Potenza non disponibile'
    : net > 0
      ? `Scarica ${formatPower(net)}`
      : net < 0
        ? `Carica ${formatPower(Math.abs(net))}`
        : 'Potenza ferma';
  if (stateOfCharge !== null) {
    return { key: 'battery', value: `${Math.round(stateOfCharge)}%`, label: `Batteria · ${flow}` };
  }
  if (net !== null) return { key: 'battery', value: formatPower(Math.abs(net)), label: `Batteria · ${flow}` };
  return { key: 'battery', value: '—', label: 'Batteria · Dati non disponibili' };
}

function statusNotice(resource: Pick<EnergyCoreResource, 'state' | 'error' | 'loading' | 'live'>) {
  const { state, error, loading, live } = resource;
  if (!live) {
    return {
      label: 'Non collegato',
      text: 'Collega Home Assistant per visualizzare misurazioni energetiche reali.',
      tone: 'neutral' as const,
    };
  }
  if (!state && loading) {
    return {
      label: 'Caricamento',
      text: 'Domus Energy sta leggendo lo stato dell’impianto da Home Assistant.',
      tone: 'info' as const,
    };
  }
  if (!state && error) {
    return { label: 'Non disponibile', text: error.message, tone: 'warning' as const };
  }
  if (!state) {
    return {
      label: 'In attesa',
      text: 'Le misurazioni energetiche non sono ancora disponibili.',
      tone: 'neutral' as const,
    };
  }
  if (!state.configured) {
    return {
      label: 'Da configurare',
      text: 'Configura Domus Energy per collegare i sensori reali dell’impianto.',
      tone: 'info' as const,
    };
  }
  if (error) {
    return {
      label: 'Aggiornamento incompleto',
      text: `Gli ultimi valori disponibili potrebbero non essere attuali. ${error.message}`,
      tone: 'warning' as const,
    };
  }

  const modules = Object.values(state.modules);
  if (modules.length > 0 && modules.every((module) => module?.status === 'offline')) {
    return {
      label: 'Sensori offline',
      text: 'L’impianto è configurato, ma i sensori energetici non forniscono dati validi.',
      tone: 'warning' as const,
    };
  }
  if (state.offline_modules.length > 0) {
    return {
      label: 'Dati parziali',
      text: 'Alcuni moduli configurati sono offline. I valori disponibili restano misurazioni reali.',
      tone: 'warning' as const,
    };
  }
  return {
    label: 'Monitoraggio attivo',
    text: 'Valori istantanei normalizzati da Domus Energy. Storici e costi non sono ancora disponibili.',
    tone: 'success' as const,
  };
}

/** Costs need the history even with a tariff, so only the missing piece changes. */
function costNote(state: EnergyState | null) {
  if (state?.tariff) return 'Storico non disponibile';
  return state && !('tariff' in state) ? 'Aggiorna l’integrazione' : 'Tariffa non configurata';
}

export function buildEnergyOverview(
  resource: Pick<EnergyCoreResource, 'state' | 'error' | 'loading' | 'live'>,
): EnergyOverview {
  const state = resource.state;
  const home = homeMetric(state);
  return {
    notice: statusNotice(resource),
    metrics: [
      home,
      gridMetric(state?.modules.grid),
      solarMetric(state?.modules.solar),
      batteryMetric(state?.modules.battery),
    ],
    cardMetrics: [
      { value: home.value, label: home.label },
      { value: '—', label: 'Energia odierna · Storico non disponibile' },
      { value: '—', label: `Costo odierno · ${costNote(state)}` },
    ],
  };
}
