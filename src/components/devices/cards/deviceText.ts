import type { DevicesTranslator } from '../../../i18n/devicesTranslations';
import { deviceStatusOf, iconActionOf, type DeviceKind, type DeviceModel } from '../model/device';

function onOffWords(kind: DeviceKind, dt: DevicesTranslator) {
  if (kind === 'outlet') return [dt('plugOn'), dt('plugOff')];
  if (kind === 'virtual') return [dt('virtualOn'), dt('virtualOff')];
  return [dt('switchOn'), dt('switchOff')];
}

/** "86 W", "In standby · 3 W", "Velocità 2 · Oscilla", "In apertura · 40%", "48% → 50%"… */
export function formatDeviceStatus(model: DeviceModel, dt: DevicesTranslator) {
  const status = deviceStatusOf(model);
  switch (status.kind) {
    case 'unavailable':
      return dt('unavailable');
    case 'off':
      if (status.device === 'humidifier' && typeof status.humidity === 'number') return dt('humidifierOffAt', { pct: status.humidity });
      return onOffWords(status.device, dt)[1];
    case 'on':
      return onOffWords(status.device, dt)[0];
    case 'watts':
      return status.standby ? dt('standbyWatts', { w: status.watts }) : dt('watts', { w: status.watts });
    case 'fan': {
      const head = status.preset ?? (status.steps ? dt('fanSpeed', { level: status.level }) : dt('level', { pct: status.level }));
      const tail = status.oscillating ? dt('oscillating') : status.winter ? dt('winter') : null;
      return tail ? `${head} · ${tail}` : head;
    }
    case 'cover': {
      if (status.moving) {
        const word = status.moving === 'opening' ? dt('coverOpening') : dt('coverClosing');
        return status.position === null ? word : `${word} · ${status.position}%`;
      }
      if (status.position === null) return status.open ? dt('coverOpen') : dt('coverClosed');
      if (status.position >= 100) return dt('coverOpen');
      if (status.position <= 0) return dt('coverClosed');
      return dt('coverOpenAt', { pct: status.position });
    }
    case 'humidity':
      return status.current !== null && status.target !== null
        ? dt('humidityTo', { current: status.current, target: status.target })
        : onOffWords('switch', dt)[0];
    default:
      return '';
  }
}

/** What the icon says it will do: "Spegni Presa TV", "Apri Tapparella", "Ferma Tapparella"… */
export function deviceIconLabel(model: DeviceModel, dt: DevicesTranslator) {
  const action = iconActionOf(model);
  const name = model.name;
  if (action.type === 'cover_stop') return dt('stopCover', { name });
  if (action.type === 'cover_open') return dt('openCover', { name });
  if (action.type === 'cover_close') return dt('closeCover', { name });
  if (model.kind === 'virtual') return action.type === 'turn_off' ? dt('deactivate', { name }) : dt('activate', { name });
  return action.type === 'turn_off' ? dt('turnOff', { name }) : dt('turnOn', { name });
}
