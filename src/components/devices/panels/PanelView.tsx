import React from 'react';
import { clsx } from 'clsx';
import { LayoutGrid } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { usePanelNavWords } from '../../../i18n/panelNavTranslations';
import { GlassButton } from '../../ui/GlassButton';
import { GlassListRow } from '../../ui/GlassListRow';
import { GlassSwitch } from '../../ui/GlassSwitch';
import { arrangeControls, isActionControl, type PanelControl, type PanelHeroKind, type PanelLook, type PanelSpec } from './registry';
import { PanelGroups, type PanelGroup } from './shell/PanelGroups';
import { PanelHeader } from './shell/PanelHeader';
import { PanelHero } from './shell/PanelHero';
import { PanelNavBar, usePanelNav, type PanelNavItem } from './shell/PanelNavBar';
import { PanelPage } from './shell/PanelPage';
import { PanelShell, type PanelLive } from './shell/PanelShell';

/*
 * The only component that draws a panel: what it is made of comes from the registry.
 * The shortcuts of the row and the groups are the same controls.
 */

const MORE_KEY = '__more';

/** How the space of the protagonist holds a control at full size. */
const HERO_OF_LOOK: Record<PanelLook, PanelHeroKind> = {
  action: 'value',
  tiles: 'fill',
  list: 'fill',
  rows: 'fill',
  levels: 'slider',
  slider: 'slider',
  whites: 'slider',
  color: 'control',
  timer: 'control',
  pad: 'control',
  chart: 'data',
  image: 'data',
};

/** While the device is on, the icons of its groups have its colour. */
const groupOf = (control: PanelControl, deviceOn: boolean): PanelGroup => {
  const title = control.title ?? control.label;
  const common = { key: control.id, icon: control.icon, title, value: control.value, note: control.note };
  if (!isActionControl(control)) {
    return { ...common, lit: deviceOn || control.lit, trailing: control.groupTrailing, children: control.group };
  }
  if (control.actionLabel) {
    return {
      ...common,
      lit: deviceOn || (control.lit ?? control.on),
      children: (
        <GlassButton variant="soft" className="panel-group-action" on={control.on} disabled={control.disabled} onClick={control.onPress}>
          {control.actionLabel}
        </GlassButton>
      ),
    };
  }
  return {
    ...common,
    lit: deviceOn || (control.lit ?? control.on),
    trailing: <GlassSwitch label={title} size="mini" checked={Boolean(control.on)} disabled={control.disabled} onChange={control.onPress} />,
  };
};

const litOf = (control: PanelControl) => (isActionControl(control) ? control.on ?? control.lit : control.lit);

export type PanelViewProps = {
  spec: PanelSpec;
  live?: PanelLive;
  /** How a page calls its own Close, when it is not the plain word. */
  closeLabel?: string;
  onClose: () => void;
};

export function PanelView({ spec, live, closeLabel, onClose }: PanelViewProps) {
  const dt = useDevicesTranslations();
  const word = usePanelNavWords();
  const { main, more } = arrangeControls(spec.layout, spec.controls ?? []);
  const all = [...main, ...more];
  const nav = usePanelNav(spec.owner, [...all.map((entry) => entry.control.id), ...(more.length > 0 ? [MORE_KEY] : [])]);
  const off = Boolean(live?.off);
  const action = spec.action && off ? { ...spec.action, disabled: true } : spec.action;
  const header = <PanelHeader action={action} name={spec.name} status={spec.status} closeLabel={closeLabel ?? dt('close')} onClose={onClose} />;

  if (spec.free) {
    return (
      <PanelShell accent={spec.accent} tint={spec.tint && !off} off={off} header={header} states={live?.notice}>
        {spec.free}
      </PanelShell>
    );
  }

  const open = all.find((entry) => entry.control.id === nav.open);
  const openInMore = nav.from === MORE_KEY;
  const isOpenBig = open && !isActionControl(open.control) ? open : null;
  const lookWord: Record<PanelLook, string> = {
    action: word('lookAction'),
    tiles: word('lookTiles'),
    list: word('lookList'),
    levels: word('lookLevels'),
    slider: word('lookSlider'),
    whites: word('lookWhites'),
    color: word('lookColor'),
    timer: word('lookTimer'),
    chart: word('lookChart'),
    rows: word('lookRows'),
    image: word('lookImage'),
    pad: word('lookPad'),
  };

  const barItems: PanelNavItem[] = spec.noRow
    ? []
    : main.map(({ control }) => ({
        key: control.id,
        icon: control.icon,
        label: control.label,
        ariaLabel: control.ariaLabel,
        kind: isActionControl(control) ? ('action' as const) : ('control' as const),
        lit: litOf(control),
        selected: !isActionControl(control) && nav.open === control.id,
        disabled: off || control.disabled,
        onPress: () => (isActionControl(control) ? control.onPress() : nav.toggle(control.id)),
      }));
  if (!spec.noRow && more.length > 0) {
    barItems.push({
      key: MORE_KEY,
      icon: <LayoutGrid size={20} strokeWidth={2} />,
      label: word('more'),
      kind: 'more',
      // You are somewhere inside it.
      selected: nav.open === MORE_KEY || more.some(({ control }) => control.id === nav.open),
      disabled: off,
      onPress: () => nav.toggle(MORE_KEY),
    });
  }

  const moreList = more.map(({ control, look }) => (
    <GlassListRow
      key={control.id}
      icon={control.icon}
      title={control.title ?? control.label}
      note={control.kindName ?? lookWord[look]}
      value={control.value}
      lit={litOf(control)}
      opens={!isActionControl(control)}
      disabled={off || control.disabled}
      onPress={() => (isActionControl(control) ? control.onPress() : nav.toggle(control.id, MORE_KEY))}
    />
  ));

  const page = spec.page
    ? { ...spec.page, fill: false }
    : nav.open === MORE_KEY
      ? { title: word('more'), sub: word('moreCount', { n: more.length }), onBack: nav.back, content: moreList, fill: false, phoneOnly: false }
      : isOpenBig && !isActionControl(isOpenBig.control) && openInMore
        ? {
            title: isOpenBig.control.title ?? isOpenBig.control.label,
            sub: isOpenBig.control.value,
            onBack: nav.back,
            fill: true,
            phoneOnly: false,
            content: <PanelHero className={`is-${HERO_OF_LOOK[isOpenBig.look]}`}>{isOpenBig.control.big(isOpenBig.look)}</PanelHero>,
          }
        : null;
  const big = isOpenBig && !openInMore && !isActionControl(isOpenBig.control) ? { control: isOpenBig.control, look: isOpenBig.look } : null;
  const heroKind = spec.confirm ? 'value' : big ? HERO_OF_LOOK[big.look] : spec.heroKind;

  return (
    <PanelShell
      accent={spec.accent}
      tint={spec.tint && !off}
      off={off}
      header={header}
      states={live?.notice}
      hero={
        <PanelHero
          className={clsx(`is-${heroKind}`)}
          back={big && !spec.confirm ? { label: spec.heroName ?? dt('back'), onPress: nav.home } : undefined}
          below={big || spec.confirm ? undefined : spec.below}
        >
          {spec.confirm ?? big?.control.big(big.look) ?? spec.hero}
        </PanelHero>
      }
      nav={page ? undefined : <PanelNavBar ariaLabel={dt('panelAdjust')} items={barItems} />}
      groups={
        page && !page.phoneOnly ? undefined : (
          <PanelGroups
            before={spec.confirm}
            groups={main.map((entry) => entry.control).filter((control) => isActionControl(control) || control.group !== null).map((control) => groupOf(control, Boolean(spec.action?.on)))}
            more={
              more.length > 0
                ? {
                    icon: <LayoutGrid size={16} strokeWidth={2} />,
                    lit: Boolean(spec.action?.on),
                    title: word('more'),
                    count: word('moreCount', { n: more.length }),
                    summary: more
                      .map(({ control }) => [control.title ?? control.label, typeof control.value === 'string' || typeof control.value === 'number' ? control.value : null].filter((part) => part !== null).join(' '))
                      .join(' · '),
                    onPress: () => nav.toggle(MORE_KEY),
                  }
                : undefined
            }
          />
        )
      }
      page={
        page ? (
          <PanelPage title={page.title} sub={page.sub} backLabel={dt('back')} onBack={page.onBack} fill={page.fill}>
            {page.content}
          </PanelPage>
        ) : undefined
      }
      pagePhoneOnly={Boolean(page?.phoneOnly)}
    />
  );
}

export default PanelView;
