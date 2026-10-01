import type { EnergyDiscovery, EnergyModuleId } from '../../../services/energyCoreClient';
import type { EnergyDraft } from './energyDraft';
import { MODULE_META, directionOf, formatPower, type FlowNodeView, type FlowView } from './energyModel';

/**
 * Preview of an unsaved draft. Values come only from readings the backend
 * normalized during discovery; nothing is derived here, so home consumption
 * without a dedicated sensor is shown as computed after saving.
 */
export function buildFlowFromDraft(draft: EnergyDraft, discovery: EnergyDiscovery | null): FlowView {
  const read = (entityId: string | undefined) => {
    const preview = entityId ? discovery?.candidates[entityId]?.preview : undefined;
    return preview && preview.status === 'ok' ? preview.value : null;
  };
  const nodes: FlowNodeView[] = [];
  for (const id of ['grid', 'solar', 'battery', 'wallbox'] as EnergyModuleId[]) {
    const module = draft[id];
    if (!module.present) continue;
    const sensors = module.sensors;
    const net = module.mode === 'net' ? read(sensors.net_power) : null;
    const sign = module.signConvention === 'positive_export' || module.signConvention === 'positive_charge' ? -1 : 1;
    let inbound: number | null = null;
    let value: number | null = null;
    let caption: string | undefined;
    if (id === 'solar') {
      inbound = value = read(sensors.production_power);
    } else if (id === 'wallbox') {
      value = read(sensors.charging_power);
      inbound = value === null ? null : -value;
    } else if (module.mode === 'net') {
      value = net === null ? null : Math.abs(net);
      inbound = net === null || !module.signConvention ? null : net * sign;
      if (net !== null && !module.signConvention) caption = 'Segno da confermare';
    } else {
      const [into, out] = id === 'grid' ? ['import_power', 'export_power'] : ['discharge_power', 'charge_power'];
      const inValue = read(sensors[into]);
      const outValue = read(sensors[out]);
      // Each measured direction is shown as read; no balance is computed here.
      if (inValue !== null && inValue > 0) inbound = inValue;
      else if (outValue !== null && outValue > 0) inbound = -outValue;
      else inbound = inValue ?? outValue;
      value = inbound === null ? null : Math.abs(inbound);
    }
    if (inbound !== null && !caption && (id === 'grid' || id === 'battery')) {
      caption = id === 'grid' ? (inbound >= 0 ? 'Prelievo' : 'Immissione') : inbound >= 0 ? 'Scarica' : 'Carica';
    }
    const soc = id === 'battery' ? read(sensors.state_of_charge) : null;
    const online = Object.values(sensors).some((entityId) => read(entityId) !== null);
    nodes.push({
      id,
      label: MODULE_META[id].label,
      value: soc !== null ? `${Math.round(soc)}%` : value === null ? '—' : formatPower(value),
      caption: online ? caption : 'Lettura dopo il salvataggio',
      online,
      direction: directionOf(inbound),
      amountW: Math.abs(inbound ?? 0),
    });
  }
  const home = draft.home.present ? read(draft.home.sensors.consumption_power) : null;
  return {
    nodes,
    home: home === null
      ? { value: '—', caption: draft.grid.present ? 'Calcolato dopo il salvataggio' : 'Non disponibile', online: false }
      : { value: formatPower(home), caption: 'Misurato', online: true },
  };
}
