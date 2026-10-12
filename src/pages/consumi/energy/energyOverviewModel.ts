import type { EnergyModuleState, EnergyQuantity, EnergyState } from '../../../services/energyCoreClient';
import type { EnergyCoreResource } from './useEnergyCore';
import { REASON_LABEL, formatPower } from './energyModel';
import type { AppLocale } from '../../../i18n/I18nProvider';
import { translateConsumption } from '../../../i18n/consumptionCopy';

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

function unavailableReason(quantity: EnergyQuantity | null | undefined, locale: AppLocale) {
  return translateConsumption(locale, REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile');
}

function homeMetric(state: EnergyState | null, locale: AppLocale): EnergyOverviewMetric {
  const quantity = state?.home_consumption;
  const value = valueOf(quantity);
  if (value === null) {
    return unavailable(translateConsumption(locale, 'Potenza casa · {reason}', { reason: unavailableReason(quantity, locale) }));
  }
  return { key: 'home', value: formatPower(value, locale), label: translateConsumption(locale, 'Potenza casa') };
}

function gridMetric(module: EnergyModuleState | undefined, locale: AppLocale): EnergyOverviewMetric {
  if (!module) return { key: 'grid', value: '—', label: translateConsumption(locale, 'Rete non configurata') };
  if (module.status === 'offline') return { key: 'grid', value: '—', label: translateConsumption(locale, 'Rete offline') };

  const net = valueOf(module.quantities.net_power);
  if (net !== null) {
    return {
      key: 'grid',
      value: formatPower(Math.abs(net), locale),
      label: translateConsumption(locale, net > 0 ? 'Prelievo rete' : net < 0 ? 'Immissione rete' : 'Rete in equilibrio'),
    };
  }
  const imported = valueOf(module.quantities.import_power);
  if (imported !== null) return { key: 'grid', value: formatPower(imported, locale), label: translateConsumption(locale, 'Prelievo misurato') };
  const exported = valueOf(module.quantities.export_power);
  if (exported !== null) return { key: 'grid', value: formatPower(exported, locale), label: translateConsumption(locale, 'Immissione misurata') };
  return { key: 'grid', value: '—', label: translateConsumption(locale, 'Potenza rete non disponibile') };
}

function solarMetric(module: EnergyModuleState | undefined, locale: AppLocale): EnergyOverviewMetric {
  if (!module) return { key: 'solar', value: '—', label: translateConsumption(locale, 'Fotovoltaico non presente') };
  if (module.status === 'offline') return { key: 'solar', value: '—', label: translateConsumption(locale, 'Fotovoltaico offline') };
  const production = valueOf(module.quantities.production_power);
  return production === null
    ? { key: 'solar', value: '—', label: translateConsumption(locale, 'Produzione non disponibile') }
    : { key: 'solar', value: formatPower(production, locale), label: translateConsumption(locale, 'Produzione fotovoltaica') };
}

function batteryMetric(module: EnergyModuleState | undefined, locale: AppLocale): EnergyOverviewMetric {
  if (!module) return { key: 'battery', value: '—', label: translateConsumption(locale, 'Batteria non presente') };
  if (module.status === 'offline') return { key: 'battery', value: '—', label: translateConsumption(locale, 'Batteria offline') };

  const stateOfCharge = valueOf(module.quantities.state_of_charge);
  const net = valueOf(module.quantities.net_power);
  const flow = net === null
    ? translateConsumption(locale, 'Potenza non disponibile')
    : net > 0
      ? translateConsumption(locale, 'Scarica {power}', { power: formatPower(net, locale) })
      : net < 0
        ? translateConsumption(locale, 'Carica {power}', { power: formatPower(Math.abs(net), locale) })
        : translateConsumption(locale, 'Potenza ferma');
  if (stateOfCharge !== null) {
    return { key: 'battery', value: `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(stateOfCharge)}%`, label: translateConsumption(locale, 'Batteria · {flow}', { flow }) };
  }
  if (net !== null) return { key: 'battery', value: formatPower(Math.abs(net), locale), label: translateConsumption(locale, 'Batteria · {flow}', { flow }) };
  return { key: 'battery', value: '—', label: translateConsumption(locale, 'Batteria · Dati non disponibili') };
}

function statusNotice(resource: Pick<EnergyCoreResource, 'state' | 'error' | 'loading' | 'live'>, locale: AppLocale) {
  const { state, error, loading, live } = resource;
  if (!live) {
    return {
      label: translateConsumption(locale, 'Non collegato'),
      text: translateConsumption(locale, 'Collega Home Assistant per visualizzare misurazioni energetiche reali.'),
      tone: 'neutral' as const,
    };
  }
  if (!state && loading) {
    return {
      label: translateConsumption(locale, 'Caricamento'),
      text: translateConsumption(locale, 'Domus Energy sta leggendo lo stato dell’impianto da Home Assistant.'),
      tone: 'info' as const,
    };
  }
  if (!state && error) {
    return { label: translateConsumption(locale, 'Non disponibile'), text: error.message, tone: 'warning' as const };
  }
  if (!state) {
    return {
      label: translateConsumption(locale, 'In attesa'),
      text: translateConsumption(locale, 'Le misurazioni energetiche non sono ancora disponibili.'),
      tone: 'neutral' as const,
    };
  }
  if (!state.configured) {
    return {
      label: translateConsumption(locale, 'Da configurare'),
      text: translateConsumption(locale, 'Configura Domus Energy per collegare i sensori reali dell’impianto.'),
      tone: 'info' as const,
    };
  }
  if (error) {
    return {
      label: translateConsumption(locale, 'Aggiornamento incompleto'),
      text: translateConsumption(locale, 'Gli ultimi valori disponibili potrebbero non essere attuali. {error}', { error: error.message }),
      tone: 'warning' as const,
    };
  }

  const modules = Object.values(state.modules);
  if (modules.length > 0 && modules.every((module) => module?.status === 'offline')) {
    return {
      label: translateConsumption(locale, 'Sensori offline'),
      text: translateConsumption(locale, 'L’impianto è configurato, ma i sensori energetici non forniscono dati validi.'),
      tone: 'warning' as const,
    };
  }
  if (state.offline_modules.length > 0) {
    return {
      label: translateConsumption(locale, 'Dati parziali'),
      text: translateConsumption(locale, 'Alcuni moduli configurati sono offline. I valori disponibili restano misurazioni reali.'),
      tone: 'warning' as const,
    };
  }
  return {
    label: translateConsumption(locale, 'Monitoraggio attivo'),
    text: translateConsumption(locale, 'Valori istantanei normalizzati da Domus Energy. Storici e costi non sono ancora disponibili.'),
    tone: 'success' as const,
  };
}

/** Costs need the history even with a tariff, so only the missing piece changes. */
function costNote(state: EnergyState | null, locale: AppLocale) {
  if (state?.tariff) return translateConsumption(locale, 'Storico non disponibile');
  return translateConsumption(locale, state && !('tariff' in state) ? 'Aggiorna l’integrazione' : 'Tariffa non configurata');
}

export function buildEnergyOverview(
  resource: Pick<EnergyCoreResource, 'state' | 'error' | 'loading' | 'live'>,
  locale: AppLocale = 'it',
): EnergyOverview {
  const state = resource.state;
  const home = homeMetric(state, locale);
  return {
    notice: statusNotice(resource, locale),
    metrics: [
      home,
      gridMetric(state?.modules.grid, locale),
      solarMetric(state?.modules.solar, locale),
      batteryMetric(state?.modules.battery, locale),
    ],
    cardMetrics: [
      { value: home.value, label: home.label },
      { value: '—', label: translateConsumption(locale, 'Energia odierna · Storico non disponibile') },
      { value: '—', label: translateConsumption(locale, 'Costo odierno · {note}', { note: costNote(state, locale) }) },
    ],
  };
}
