import React from 'react';
import { clsx } from 'clsx';
import { UserRound } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelsTranslations } from '../../../../i18n/panelsTranslations';
import type { MockEntityStateMap } from '../../../../types/ha';
import type { MembersPresenceEntry } from '../../../settings/types';
import { entityChangedAt, formatPanelSpan, MEMBERS_MAP_ENABLED, memberBattery, memberIsHome } from '../../model/panelRules';
import { usePanelTechnicalEntities } from '../panelData';
import { GlassValueRows } from '../../../ui/GlassListRow';
import type { PanelControl, PanelEntry, PanelSpec } from '../registry';
import { PanelFitList } from './fitList';
import { accentOf, ICON, PanelRows } from './shared';
import './data.css';

/*
 * Who is at home: each person in the middle, and below the details of the one chosen.
 * The battery of a phone appears only when its sensor is found. The map stays behind an
 * option that is off, until the household agrees to it.
 */

export type MembersPanelInput = {
  name: string;
  /** The entity of the card: what the panel belongs to, as for every other device. Without it, its name. */
  entityId?: string;
  members: MembersPresenceEntry[];
  haStates: MockEntityStateMap;
  mapEnabled?: boolean;
};

const clock = (time: number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const MEMBER_COLOURS = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5ae2', '#ff453a'];

/** Places the people of the house inside the frame, with no map tiles behind them. */
function mapPins(members: MembersPresenceEntry[]) {
  const located = members.filter((member) => typeof member.latitude === 'number' && typeof member.longitude === 'number');
  if (located.length === 0) return [];
  const lats = located.map((member) => member.latitude as number);
  const lons = located.map((member) => member.longitude as number);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return located.map((member) => ({
    id: member.personEntityId,
    initial: (member.name.trim().charAt(0) || '?').toUpperCase(),
    x: maxLon === minLon ? 50 : 12 + (((member.longitude as number) - minLon) / (maxLon - minLon)) * 76,
    y: maxLat === minLat ? 50 : 88 - (((member.latitude as number) - minLat) / (maxLat - minLat)) * 76,
  }));
}

function useMembersSpec({ name, entityId, members, haStates, mapEnabled = MEMBERS_MAP_ENABLED }: MembersPanelInput): PanelSpec {
  const pt = usePanelsTranslations();
  const { locale } = useI18n();
  const technicalEntities = usePanelTechnicalEntities();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [personOpen, setPersonOpen] = React.useState(false);
  const [allOpen, setAllOpen] = React.useState(false);
  const now = Date.now();
  const spanWords = { min: pt('spanMin'), hour: pt('spanHour'), day: pt('spanDay') };
  const span = (ms: number) => formatPanelSpan(ms, spanWords);

  const homeCount = members.filter((member) => memberIsHome(member.state)).length;
  const selected = members.find((member) => member.personEntityId === selectedId) ?? members[0];

  const place = (member: MembersPresenceEntry) => {
    if (memberIsHome(member.state)) return pt('mbHome');
    return member.locationLabel?.trim() || (member.state === 'not_home' ? pt('mbAway') : pt('mbUnknownPlace'));
  };
  const presenceText = (member: MembersPresenceEntry) => {
    const changedAt = entityChangedAt(haStates[member.personEntityId]);
    if (changedAt === null) return place(member);
    if (memberIsHome(member.state)) return pt('mbHomeSince', { time: span(now - changedAt) });
    return pt('mbAwaySince', { zone: place(member), time: span(now - changedAt) });
  };

  const details: Array<readonly [string, string]> = [];
  if (selected) {
    const entity = haStates[selected.personEntityId];
    const changedAt = entityChangedAt(entity);
    const updatedAt = entityChangedAt(entity, '__last_updated');
    const battery = memberBattery(selected.trackerEntityIds, haStates, technicalEntities);
    const deviceCount = selected.devices.smartphone + selected.devices.tablet + selected.devices.smartwatch + selected.devices.tracker;
    if (changedAt !== null) details.push([memberIsHome(selected.state) ? pt('mbHomeFrom') : pt('mbAwayFrom'), clock(changedAt, locale)]);
    if (battery !== null) details.push([pt('mbPhone'), `${Math.round(battery)}%`]);
    if (updatedAt !== null) details.push([pt('mbUpdated'), now - updatedAt < 60000 ? pt('now') : pt('ago', { time: span(now - updatedAt) })]);
    if (deviceCount > 0) details.push([pt('mbDevices'), String(deviceCount)]);
  }
  const pins = mapEnabled ? mapPins(members) : [];
  const rows = members.map((member, index) => {
          const isSelected = member.personEntityId === selected?.personEntityId;
          const home = memberIsHome(member.state);
          return (
            <button key={member.personEntityId} type="button" className={clsx('panel-person', isSelected && 'is-selected')} aria-pressed={isSelected} onClick={() => {
              setSelectedId(member.personEntityId);
              setPersonOpen(true);
            }}>
              <span className="panel-person-avatar" aria-hidden="true" style={member.avatarUrl ? undefined : { background: MEMBER_COLOURS[index % MEMBER_COLOURS.length] }}>
                {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : (member.name.trim().charAt(0) || '?').toUpperCase()}
              </span>
              <span className="panel-person-text">
                <b>{member.name}</b>
                <span className={clsx(!home && 'is-away')}>{presenceText(member)}</span>
              </span>
              <span className="panel-person-place">{place(member)}</span>
            </button>
          );
  });
  const detailRows = (size: 'default' | 'hero') => <GlassValueRows size={size} rows={details.map(([title, value]) => ({ key: title, title, value }))} />;
  const controls: PanelControl[] =
    selected && details.length > 0
      ? [{ id: 'details', icon: <UserRound {...ICON} />, label: selected.name, value: place(selected), looks: ['rows'], big: () => detailRows('hero'), group: <PanelRows rows={details} /> }]
      : [];
  const page = allOpen
    ? { title: name, onBack: () => setAllOpen(false), content: <div className="panel-members-all">{rows}</div> }
    : personOpen && selected && details.length > 0
      ? { title: selected.name, sub: place(selected), onBack: () => setPersonOpen(false), phoneOnly: true, content: detailRows('default') }
      : undefined;

  return {
    owner: entityId ?? name,
    name,
    status: members.length === 0 ? pt('mbNobody') : pt('mbSub', { home: homeCount, away: members.length - homeCount }),
    layout: 'members',
    noRow: true,
    accent: accentOf('48 209 88'),
    tint: homeCount > 0,
    heroKind: 'data',
    hero: (
      <div className="dv-card panel-members">
        {pins.length > 0 ? (
          <div className="panel-members-map" role="img" aria-label={pt('mbMapAria')}>
            {pins.map((pin) => (
              <span key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%` }}>
                {pin.initial}
              </span>
            ))}
          </div>
        ) : null}
        {members.length === 0 ? <p className="dv-t2 m-0 text-sm font-medium">{pt('mbNobody')}</p> : <PanelFitList className="panel-members-list" rows={rows} moreLabel={(count) => pt('listMore', { count })} onMore={() => setAllOpen(true)} />}
      </div>
    ),
    controls,
    page,
  };
}

export const membersEntry: PanelEntry<MembersPanelInput> = { useSpec: useMembersSpec };
