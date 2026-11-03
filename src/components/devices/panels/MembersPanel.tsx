import { useState } from 'react';
import { clsx } from 'clsx';
import { BatteryMedium, Users } from 'lucide-react';
import { usePanelsTranslations } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import type { MockEntityStateMap } from '../../../types/ha';
import type { MembersPresenceEntry } from '../../settings/types';
import { entityChangedAt, formatPanelSpan, MEMBERS_MAP_ENABLED, memberBattery, memberIsHome } from '../model/panelRules';
import { useEntityRegistry } from './panelData';
import { PanelShell, type PanelLive } from './PanelShell';
import '../theme/panelLive.css';
import '../theme/panels.css';

/*
 * Who is at home: each person with their state and zone, then the details of
 * the one chosen. The battery of a phone appears only when its sensor is found.
 * The map stays behind an option that is off, until the household agrees to it;
 * the alert on arrival waits for a way to send notifications from here.
 */

export type MembersPanelProps = {
  name: string;
  members: MembersPresenceEntry[];
  haStates: MockEntityStateMap;
  mapEnabled?: boolean;
  embedded?: boolean;
  live?: PanelLive;
  onClose: () => void;
};

const clock = (time: number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const MEMBER_COLOURS = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5ae2', '#ff453a'];

type Pin = { id: string; initial: string; x: number; y: number };
type Zone = { id: string; x: number; y: number; size: number };

/** Places the people and the zones of the house inside the frame, with no map tiles behind them. */
function mapPlaces(members: MembersPresenceEntry[], haStates: MockEntityStateMap): { pins: Pin[]; zones: Zone[] } {
  const located = members.filter((member) => typeof member.latitude === 'number' && typeof member.longitude === 'number');
  const zoneEntries = Object.entries(haStates).filter(([id, entity]) => id.startsWith('zone.') && typeof entity.rawAttributes?.latitude === 'number' && typeof entity.rawAttributes?.longitude === 'number');
  const lats = [...located.map((member) => member.latitude as number), ...zoneEntries.map(([, entity]) => entity.rawAttributes?.latitude as number)];
  const lons = [...located.map((member) => member.longitude as number), ...zoneEntries.map(([, entity]) => entity.rawAttributes?.longitude as number)];
  if (lats.length === 0) return { pins: [], zones: [] };
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const x = (lon: number) => (maxLon === minLon ? 50 : 12 + ((lon - minLon) / (maxLon - minLon)) * 76);
  const y = (lat: number) => (maxLat === minLat ? 50 : 88 - ((lat - minLat) / (maxLat - minLat)) * 76);
  return {
    pins: located.map((member) => ({ id: member.personEntityId, initial: (member.name.trim().charAt(0) || '?').toUpperCase(), x: x(member.longitude as number), y: y(member.latitude as number) })),
    zones: zoneEntries.map(([id, entity]) => ({ id, x: x(entity.rawAttributes?.longitude as number), y: y(entity.rawAttributes?.latitude as number), size: 72 })),
  };
}

export function MembersPanel({ name, members, haStates, mapEnabled = MEMBERS_MAP_ENABLED, embedded = false, live, onClose }: MembersPanelProps) {
  const pt = usePanelsTranslations();
  const { locale } = useI18n();
  const registry = useEntityRegistry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = Date.now();
  const spanWords = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };
  const span = (ms: number) => formatPanelSpan(ms, spanWords);

  const homeCount = members.filter((member) => memberIsHome(member.state)).length;
  const subtitle = members.length === 0 ? pt('mbNobody') : pt('mbSub', { home: homeCount, away: members.length - homeCount });
  const selected = members.find((member) => member.personEntityId === selectedId) ?? members[0];

  const place = (member: MembersPresenceEntry) => {
    if (memberIsHome(member.state)) return pt('mbHome');
    const label = member.locationLabel?.trim();
    return label || (member.state === 'not_home' ? pt('mbAway') : pt('mbUnknownPlace'));
  };
  const presenceText = (member: MembersPresenceEntry) => {
    const changedAt = entityChangedAt(haStates[member.personEntityId]);
    if (changedAt === null) return place(member);
    if (memberIsHome(member.state)) return pt('mbHomeSince', { time: span(now - changedAt) });
    return pt('mbAwaySince', { zone: place(member), time: span(now - changedAt) });
  };
  const batteryOf = (member: MembersPresenceEntry) => memberBattery(member.trackerEntityIds, haStates, registry?.registryEntities ?? null);

  const details: Array<[string, string]> = [];
  if (selected) {
    const entity = haStates[selected.personEntityId];
    const changedAt = entityChangedAt(entity);
    const updatedAt = entityChangedAt(entity, '__last_updated');
    const battery = batteryOf(selected);
    const deviceCount = selected.devices.smartphone + selected.devices.tablet + selected.devices.smartwatch + selected.devices.tracker;
    if (changedAt !== null) details.push([memberIsHome(selected.state) ? pt('mbHomeFrom') : pt('mbAwayFrom'), clock(changedAt, locale)]);
    if (battery !== null) details.push([pt('mbPhone'), `${Math.round(battery)}%`]);
    if (updatedAt !== null) details.push([pt('mbUpdated'), now - updatedAt < 60000 ? pt('now') : pt('ago', { time: span(now - updatedAt) })]);
    if (deviceCount > 0) details.push([pt('mbDevices'), String(deviceCount)]);
  }
  const places = mapEnabled ? mapPlaces(members, haStates) : null;

  return (
    <PanelShell
      icon={<Users size={23} strokeWidth={2} />}
      iconClassName="bg-[rgb(48_209_88/0.18)] text-[#30d158]"
      name={name}
      subtitle={subtitle}
      liveSubtitle
      embedded={embedded}
      live={live}
      onClose={onClose}
    >
      {places && places.pins.length > 0 ? (
        <div className="dv-pn-pmap" role="img" aria-label={pt('mbMapAria')}>
          {places.zones.map((zone) => (
            <span key={zone.id} className="dv-pn-zone" style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: zone.size, height: zone.size }} />
          ))}
          {places.pins.map((pin) => (
            <span key={pin.id} className="dv-pn-pin" style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>{pin.initial}</span>
          ))}
        </div>
      ) : null}

      {members.length > 0 ? (
        <div className="dv-card dv-pn-rows">
          {members.map((member, index) => {
            const battery = batteryOf(member);
            const isSelected = member.personEntityId === selected?.personEntityId;
            return (
              <button
                key={member.personEntityId}
                type="button"
                className={clsx('dv-pn-row dv-pn-person', isSelected && 'is-selected')}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(member.personEntityId)}
              >
                <span className="dv-pn-avatar" aria-hidden="true" style={member.avatarUrl ? undefined : { background: MEMBER_COLOURS[index % MEMBER_COLOURS.length], color: '#ffffff' }}>
                  {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : (member.name.trim().charAt(0) || '?').toUpperCase()}
                </span>
                <span className="dv-pn-rt">
                  <b>{member.name}</b>
                  <span className="dv-t2">{presenceText(member)}</span>
                </span>
                {battery !== null ? (
                  <span className="dv-pn-tm dv-t2">
                    <BatteryMedium size={14} strokeWidth={2} aria-hidden="true" />{Math.round(battery)}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {selected && details.length > 0 ? (
        <>
          <div className="dv-pn-label">{selected.name}</div>
          <div className="dv-card dv-pn-rows">
            {details.map(([label, value]) => (
              <div key={label} className="dv-pn-row">
                <span className="dv-pn-rt"><b>{label}</b></span>
                <span className="dv-pn-tm dv-t2">{value}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </PanelShell>
  );
}

export default MembersPanel;
