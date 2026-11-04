import React from 'react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { GlassSwitch } from '../../ui/GlassSwitch';
import { GlassButton } from '../../ui/GlassButton';
import type { PanelItem, PanelSpec } from './registry';
import { PanelControlZone, usePanelScreen, type PanelShortcutItem } from './shell/PanelControlZone';
import { PanelFooter } from './shell/PanelFooter';
import { PanelGroups, type PanelGroup } from './shell/PanelGroups';
import { PanelHeader } from './shell/PanelHeader';
import { PanelHero } from './shell/PanelHero';
import { PanelShell, type PanelLive } from './shell/PanelShell';

/*
 * The only component that draws a panel: what it is made of comes from the registry.
 * The shortcuts of the zone and the groups of the dialog are the same controls.
 */

function ScreenBody({ item }: { item: Extract<PanelItem, { kind: 'opens' }> }) {
  return (
    <>
      <p className="panel-screen-title">
        <b>{item.title ?? item.label}</b>
        {item.value ? <span> · {item.value}</span> : null}
      </p>
      {item.content('zone')}
      {item.note ? <p className="panel-screen-note">{item.note}</p> : null}
    </>
  );
}

const shortcutOf = (item: PanelItem): PanelShortcutItem =>
  item.kind === 'opens'
    ? { key: item.key, icon: item.icon, label: item.label, disabled: item.disabled, kind: 'opens', content: <ScreenBody item={item} /> }
    : { key: item.key, icon: item.icon, label: item.label, disabled: item.disabled, kind: 'acts', on: item.on, onPress: item.onPress };

const groupOf = (item: PanelItem): PanelGroup => {
  const title = item.title ?? item.label;
  if (item.kind === 'opens') {
    return { key: item.key, icon: item.icon, lit: item.lit, title, value: item.value, trailing: item.groupTrailing, note: item.note, children: item.group ?? item.content('group') };
  }
  return {
    key: item.key,
    icon: item.icon,
    lit: item.lit ?? item.on,
    title,
    note: item.note,
    trailing: item.kind === 'toggle' ? (
      <GlassSwitch label={title} size="mini" checked={item.on} disabled={item.disabled} onChange={item.onPress} />
    ) : (
      <GlassButton variant="soft" className="panel-group-action" on={item.on} disabled={item.disabled} onClick={item.onPress}>
        {item.actionLabel}
      </GlassButton>
    ),
  };
};

export type PanelViewProps = {
  spec: PanelSpec;
  live?: PanelLive;
  /** How a page calls its own Close, when it is not the plain word. */
  closeLabel?: string;
  onClose: () => void;
};

export function PanelView({ spec, live, closeLabel, onClose }: PanelViewProps) {
  const dt = useDevicesTranslations();
  const screen = usePanelScreen(spec.owner, spec.shortcuts.map(shortcutOf));
  const open = spec.shortcuts.find((item) => item.key === screen.open);
  const heroInstead = open?.kind === 'opens' ? open.hero : undefined;
  const off = Boolean(live?.off);
  const action = spec.action && off ? { ...spec.action, disabled: true } : spec.action;
  const header = <PanelHeader icon={spec.icon} lit={spec.lit} name={spec.name} status={spec.status} closeLabel={closeLabel ?? dt('close')} onClose={onClose} />;

  if (spec.free) {
    return (
      <PanelShell accent={spec.accent} tint={spec.tint && !off} off={off} header={header} states={live?.notice}>
        {spec.free}
      </PanelShell>
    );
  }

  return (
    <PanelShell
      accent={spec.accent}
      tint={spec.tint && !off}
      off={off}
      header={header}
      states={live?.notice}
      hero={
        <PanelHero className={clsx(`is-${spec.heroKind}`, heroInstead ? 'has-instead' : null)}>
          <div className="panel-hero-main">{spec.hero}</div>
          {heroInstead ? <div className="panel-hero-instead">{heroInstead}</div> : null}
        </PanelHero>
      }
      controls={
        spec.confirm || spec.always ? (
          <PanelControlZone ariaLabel={dt('panelAdjust')}>{spec.confirm ?? spec.always}</PanelControlZone>
        ) : (
          <PanelControlZone ariaLabel={dt('panelAdjust')} shortcuts={spec.shortcuts.map(shortcutOf)} open={screen.open} onOpen={screen.onOpen} disabled={off} />
        )
      }
      groups={<PanelGroups before={spec.confirm} groups={(spec.groups ?? spec.shortcuts).map(groupOf)} />}
      footer={<PanelFooter action={action} back={screen.open && !spec.confirm ? { label: dt('back'), onPress: screen.close } : undefined} />}
    />
  );
}

export default PanelView;
