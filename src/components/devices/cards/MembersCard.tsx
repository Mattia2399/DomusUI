import type React from 'react';
import { useState } from 'react';
import { Users } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { CardFrame, CardHead } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';

/*
 * The people of the house in the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html). Where somebody is shows only when
 * Home Assistant says so; otherwise their role.
 *
 * Mini U×2      their faces and how many they are
 * Standard U×4  the first three, with where they are
 * Expanded W×4  each of them on the plan, to pick one
 */

export type HouseMember = {
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
  /** true at home, false away, absent when unknown. */
  home?: boolean;
  /** Where they are when away ("Scuola"), from Home Assistant. */
  place?: string;
};

const COLOURS = ['#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2', '#8E8E93'];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';

function Avatar({ member, index }: { member: HouseMember; index: number }) {
  return (
    <i className="dv-avatar" style={{ '--dv-avatar': COLOURS[index % COLOURS.length] } as React.CSSProperties} aria-hidden="true">
      {member.avatarUrl ? <img src={member.avatarUrl} alt="" loading="lazy" /> : initials(member.name)}
    </i>
  );
}

export type MembersCardProps = {
  title: string;
  members: HouseMember[];
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
};

export function MembersCard({ title, members, format, editing = false, selected = false, onOpen, onSelect }: MembersCardProps) {
  const dt = useDevicesTranslations();
  const size = deviceCardSize(format);
  const [picked, setPicked] = useState(0);
  const people = [...members].sort((first, second) => Number(second.isCurrent === true) - Number(first.isCurrent === true));
  const known = people.filter((member) => member.home !== undefined);
  const home = known.filter((member) => member.home).length;
  const summary = known.length > 0
    ? dt('membersPresence', { home, away: known.length - home })
    : people.length === 1 ? dt('membersOne') : dt('membersCount', { count: people.length });
  const whereOf = (member: HouseMember) =>
    member.home === true ? dt('membersHome') : member.home === false ? member.place ?? dt('membersAway') : member.isCurrent ? dt('membersYou') : member.roleLabel ?? '';
  const frame = (children: React.ReactNode, layout: 'row' | 'column' | 'plan') => (
    <CardFrame
      panelKind="members"
      format={format}
      available
      editing={editing}
      selected={selected}
      openLabel={dt('controlsOf', { name: title, status: summary })}
      selectLabel={dt('select', { name: title })}
      onOpen={onOpen}
      onSelect={onSelect}
    >
      {layout === 'plan' ? <span className="dv-size-gridpaper" aria-hidden="true" /> : null}
      <div className={layout === 'row' ? 'dv-tile-inner items-center gap-3 px-3.5' : layout === 'plan' ? 'dv-size-body !justify-end' : 'dv-size-body'}>{children}</div>
    </CardFrame>
  );

  if (size === 'mini') {
    return frame(
      <CardHead
        icon={<span className="dv-avatars">{people.slice(0, 3).map((member, index) => <Avatar key={member.id} member={member} index={index} />)}</span>}
        name={title}
        status={summary}
      />,
      'row',
    );
  }
  if (size === 'standard') {
    return frame(
      <>
        <CardHead icon={<span className="dv-icon-button pointer-events-none" aria-hidden="true"><Users size={20} strokeWidth={2} /></span>} name={title} status={summary} />
        <span className="dv-people">
          {people.slice(0, 3).map((member, index) => (
            <span key={member.id}>
              <Avatar member={member} index={index} />
              <b>{member.name}</b>
              <em className={member.home === true ? 'is-home' : undefined}>{whereOf(member)}</em>
            </span>
          ))}
        </span>
      </>,
      'column',
    );
  }
  return frame(
    <span className="dv-people is-row">
      {people.slice(0, 4).map((member, index) => (
        <button key={member.id} type="button" aria-pressed={index === picked} disabled={editing} onClick={() => setPicked(index)}>
          <Avatar member={member} index={index} />
          <span>
            <b>{member.name}</b>
            <em className={member.home === true ? 'is-home' : undefined}>{whereOf(member)}</em>
          </span>
        </button>
      ))}
    </span>,
    'plan',
  );
}

export default MembersCard;
