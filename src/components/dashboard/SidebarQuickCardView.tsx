import React from 'react';
import {
  Check,
  ChevronRight,
  Lightbulb,
  Recycle,
  Shield,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { HomeAttentionItem } from '../homeAttention/homeAttentionEngine';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import {
  formatCollectionDate,
  formatCollectionDay,
  formatPowerShort,
  type EnergyNow,
  type NextWasteCollection,
  type SidebarQuickCardKind,
} from './sidebarQuickCard';

/*
 * The quick card docked at the bottom of the mobile side menu, one look per
 * kind, and the gallery that picks it with live previews.
 */

export type SidebarQuickTone = 'accent' | 'danger' | 'success' | 'warning' | 'neutral';
type ShownKind = Exclude<SidebarQuickCardKind, 'none'>;

/* The surfaces inside the glass panel: soft and translucent, never glass on glass. */
export const QUICK_GROUP_SURFACE = 'border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)]';
const INNER_SURFACE = 'border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-secondary)]';

export const QUICK_TONE_CLASSES: Record<SidebarQuickTone, string> = {
  accent: 'bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]',
  danger: 'bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] text-[color:var(--ui-danger)]',
  success: 'bg-[color:color-mix(in_srgb,var(--ui-success)_15%,transparent)] text-[color:var(--ui-success)]',
  warning: 'bg-[color:color-mix(in_srgb,var(--ui-warning)_16%,transparent)] text-[color:var(--ui-warning)]',
  neutral: 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]',
};

const TONE_FILL_CLASSES: Record<SidebarQuickTone, string> = {
  accent: 'bg-[color:rgb(var(--ui-accent-rgb)/0.12)]',
  danger: 'bg-[color:color-mix(in_srgb,var(--ui-danger)_12%,transparent)]',
  success: 'bg-[color:color-mix(in_srgb,var(--ui-success)_12%,transparent)]',
  warning: 'bg-[color:color-mix(in_srgb,var(--ui-warning)_13%,transparent)]',
  neutral: 'bg-[color:var(--ui-fill-tertiary)]',
};

const SOLID_TONE_CLASSES: Record<SidebarQuickTone, string> = {
  accent: 'bg-[color:var(--ui-accent)] shadow-[0_6px_16px_-6px_rgb(var(--ui-accent-rgb)/0.7)]',
  danger: 'bg-[color:var(--ui-danger)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--ui-danger)_70%,transparent)]',
  success: 'bg-[color:var(--ui-success)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--ui-success)_70%,transparent)]',
  warning: 'bg-[color:var(--ui-warning)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--ui-warning)_70%,transparent)]',
  neutral: 'bg-[color:var(--ui-text-tertiary)]',
};

const TONE_TEXT_CLASSES: Record<SidebarQuickTone, string> = {
  accent: 'text-[color:var(--ui-accent)]',
  danger: 'text-[color:var(--ui-danger)]',
  success: 'text-[color:var(--ui-success)]',
  warning: 'text-[color:var(--ui-warning)]',
  neutral: 'text-[color:var(--ui-text-primary)]',
};

export const QUICK_KIND_LABELS = {
  attention: 'navigation.quick.kind.attention',
  alarm: 'navigation.quick.kind.alarm',
  lights: 'navigation.quick.kind.lights',
  scenes: 'navigation.quick.kind.scenes',
  energy: 'navigation.quick.kind.energy',
  waste: 'navigation.quick.kind.waste',
  none: 'navigation.quick.kind.none',
} as const;

export type SidebarScene = { id: string; label: string; icon: React.ReactNode };

export type SidebarQuickCardData = {
  attentionItems: HomeAttentionItem[];
  /** The chosen alarm, or `null` when Home Assistant has none. */
  alarm: { word: string; name: string; tone: SidebarQuickTone } | null;
  lights: { ids: string[]; names: string[]; rooms: string[] };
  canTurnOffLights: boolean;
  /** `undefined`: waste collection is not set up; `null`: nothing scheduled. */
  waste: NextWasteCollection | undefined;
  energy: { status: 'loading' } | { status: 'unavailable' } | { status: 'ok'; now: EnergyNow };
  scenes: SidebarScene[];
  runningSceneId?: string | null;
};

type SidebarQuickCardProps = {
  kind: ShownKind;
  data: SidebarQuickCardData;
  /** A preview in the gallery: no "Change" and nothing to press. */
  preview?: boolean;
  onChange?: () => void;
  onOpen?: (path: string) => void;
  onTurnOffLights?: () => void;
  onRunScene?: (sceneId: string) => void;
};

function PillButton({ tone = 'accent', onClick, children }: { tone?: 'accent' | 'warning'; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-sm font-semibold transition-[filter] hover:brightness-110 ${QUICK_TONE_CLASSES[tone]}`}
    >
      {children}
    </button>
  );
}

/** An icon, a title and a line: the empty or not-set-up state of a card. */
function StatusRow({
  icon: Icon,
  tone = 'neutral',
  title,
  detail,
  action,
}: {
  icon: LucideIcon;
  tone?: SidebarQuickTone;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-[2.625rem] w-[2.625rem] shrink-0 items-center justify-center rounded-full ${QUICK_TONE_CLASSES[tone]}`}>
        <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[0.95rem] font-semibold leading-tight tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{title}</span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-[1.35] text-[color:var(--ui-text-secondary)]">{detail}</span>
      </span>
      {action}
    </div>
  );
}

function splitPower(value: number, locale: string) {
  const text = formatPowerShort(value, locale);
  const space = text.lastIndexOf(' ');
  return { number: text.slice(0, space), unit: text.slice(space + 1) };
}

export function SidebarQuickCard({ kind, data, preview = false, onChange, onOpen, onTurnOffLights, onRunScene }: SidebarQuickCardProps) {
  const { locale, t } = useI18n();
  const [isConfirmingLights, setIsConfirmingLights] = React.useState(false);
  const open = (path: string) => onOpen?.(path);
  const attentionCount = data.attentionItems.length;

  const renderAttention = () => {
    if (attentionCount === 0) {
      return (
        <StatusRow icon={Check} tone="success" title={t('navigation.quick.attentionClear')} detail={t('navigation.quick.attentionClearHint')} />
      );
    }
    const first = data.attentionItems[0];
    const tone: SidebarQuickTone = first.severity === 'critical' ? 'danger' : 'warning';
    const more = attentionCount - 1;
    return (
      <>
        <div className={`relative ${attentionCount > 1 ? 'pb-2.5' : ''}`}>
          <div className={`relative z-[2] flex items-center gap-3 rounded-[1.1rem] py-2.5 pl-2.5 pr-3 shadow-[0_6px_16px_-8px_var(--ui-shadow-soft)] ${INNER_SURFACE}`}>
            <span className={`flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-full ${QUICK_TONE_CLASSES[tone]}`}>
              <TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.95rem] font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{first.title}</span>
              <span className="block truncate text-xs text-[color:var(--ui-text-secondary)]">{first.areaName || first.description}</span>
            </span>
          </div>
          {attentionCount > 1 ? (
            <span aria-hidden="true" className={`absolute inset-x-2.5 bottom-1 z-[1] h-4 rounded-b-[1rem] border-t-0 opacity-70 ${INNER_SURFACE}`} />
          ) : null}
          {attentionCount > 2 ? (
            <span aria-hidden="true" className={`absolute inset-x-5 bottom-0 z-0 h-3 rounded-b-[0.9rem] border-t-0 opacity-45 ${INNER_SURFACE}`} />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-[color:var(--ui-text-secondary)]">
            {more === 0
              ? first.description
              : more === 1
                ? t('navigation.quick.moreAlertsOne')
                : t('navigation.quick.moreAlertsMany', { count: more })}
          </span>
          <PillButton onClick={() => open('/home')}>
            {more === 0 ? t('navigation.quick.open') : t('navigation.quick.seeAll')}
          </PillButton>
        </div>
      </>
    );
  };

  const renderAlarm = () => {
    if (!data.alarm) {
      return <StatusRow icon={Shield} title={t('navigation.quick.alarmNone')} detail={t('navigation.quick.alarmNoneHint')} />;
    }
    const { word, name, tone } = data.alarm;
    return (
      <div className={`flex items-center gap-3 rounded-[1.1rem] p-2.5 ${TONE_FILL_CLASSES[tone]}`}>
        <span className={`flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-full text-[color:var(--ui-bg-elevated)] ${SOLID_TONE_CLASSES[tone]}`}>
          <ShieldCheck size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[1.15rem] font-bold tracking-[-0.02em] ${TONE_TEXT_CLASSES[tone]}`}>{word}</span>
          <span className="block truncate text-[13px] text-[color:var(--ui-text-secondary)]">{name}</span>
        </span>
        <button
          type="button"
          onClick={() => open('/security')}
          aria-label={t('navigation.quick.open')}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition-colors hover:text-[color:var(--ui-text-primary)] ${INNER_SURFACE}`}
        >
          <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const renderLights = () => {
    const { ids, names, rooms } = data.lights;
    const count = ids.length;
    if (count === 0) {
      return <StatusRow icon={Lightbulb} title={t('navigation.quick.lightsOff')} detail={t('navigation.quick.lightsOffHint')} />;
    }
    if (isConfirmingLights && !preview) {
      return (
        <div className="space-y-2.5">
          <div>
            <p className="text-[0.95rem] font-semibold text-[color:var(--ui-text-primary)]">{t('navigation.quick.lightsConfirmTitle')}</p>
            <p className="mt-0.5 text-[13px] leading-[1.35] text-[color:var(--ui-text-secondary)]">{t('navigation.quick.lightsConfirmBody')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsConfirmingLights(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-sm font-semibold text-[color:var(--ui-text-primary)]"
            >
              {t('navigation.logout.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirmingLights(false);
                onTurnOffLights?.();
              }}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-accent)] text-sm font-semibold text-[color:var(--ui-accent-contrast)]"
            >
              {t('navigation.quick.lightsConfirm')}
            </button>
          </div>
        </div>
      );
    }
    const chips = rooms.length > 0 ? rooms : names;
    const shownChips = chips.slice(0, 3);
    return (
      <>
        <div className="flex items-center gap-3">
          <span className="min-w-[1.6rem] text-[2.25rem] font-bold leading-none tracking-[-0.04em] tabular-nums text-[color:var(--ui-warning)]">{count}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem] font-semibold text-[color:var(--ui-text-primary)]">
              {count === 1 ? t('navigation.quick.lightsOnOne') : t('navigation.quick.lightsOnMany')}
            </span>
            {rooms.length > 0 ? (
              <span className="block truncate text-[13px] text-[color:var(--ui-text-secondary)]">
                {rooms.length === 1 ? t('navigation.quick.lightsRoomsOne') : t('navigation.quick.lightsRoomsMany', { count: rooms.length })}
              </span>
            ) : null}
          </span>
          {data.canTurnOffLights ? (
            <PillButton tone="warning" onClick={() => setIsConfirmingLights(true)}>
              {t('navigation.quick.lightsTurnOff')}
            </PillButton>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shownChips.map((chip) => (
            <span key={chip} className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-[color:var(--ui-text-primary)] ${INNER_SURFACE}`}>
              <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#ffb020] shadow-[0_0_8px_rgb(255_176_32/0.9)]" />
              <span className="truncate">{chip}</span>
            </span>
          ))}
          {chips.length > shownChips.length ? (
            <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-[color:var(--ui-text-secondary)] ${INNER_SURFACE}`}>
              +{chips.length - shownChips.length}
            </span>
          ) : null}
        </div>
      </>
    );
  };

  const renderScenes = () => {
    if (data.scenes.length === 0) {
      return <StatusRow icon={Sparkles} title={t('navigation.quick.scenesNone')} detail={t('navigation.quick.scenesNoneHint')} />;
    }
    return (
      <div className="grid grid-cols-4 gap-1">
        {data.scenes.slice(0, 4).map((scene) => {
          const running = data.runningSceneId === scene.id;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onRunScene?.(scene.id)}
              aria-label={t('navigation.quick.sceneRun', { name: scene.label })}
              aria-busy={running || undefined}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl py-0.5"
            >
              <span
                className={`flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full transition-colors duration-200 ${
                  running
                    ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
                    : 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-primary)]'
                }`}
              >
                {scene.icon}
              </span>
              <span className="w-full truncate text-center text-[11px] font-medium text-[color:var(--ui-text-primary)]">
                {running ? t('navigation.quick.sceneRunning') : scene.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderEnergy = () => {
    const energy = data.energy;
    if (energy.status === 'loading') {
      return <StatusRow icon={Zap} title={t('navigation.quick.kind.energy')} detail={t('navigation.quick.energyLoading')} />;
    }
    if (energy.status === 'unavailable') {
      return (
        <StatusRow
          icon={Zap}
          title={t('navigation.quick.energyUnavailable')}
          detail={t('navigation.quick.energyUnavailableHint')}
          action={<PillButton onClick={() => open('/consumi')}>{t('navigation.quick.open')}</PillButton>}
        />
      );
    }
    const { homeW, solarW, gridW } = energy.now;
    const home = splitPower(homeW, locale);
    const solarUsed = Math.max(0, Math.min(solarW ?? 0, homeW));
    const solarShare = homeW > 0 && solarUsed > 0 ? Math.round((solarUsed / homeW) * 100) : null;
    const gridImport = Math.max(0, gridW ?? 0);
    return (
      <>
        <div className="flex items-end justify-between gap-2">
          <span className="min-w-0">
            <span className="flex items-baseline gap-1">
              <span className="text-[2rem] font-bold leading-none tracking-[-0.04em] tabular-nums text-[color:var(--ui-text-primary)]">{home.number}</span>
              <span className="text-[0.95rem] font-semibold text-[color:var(--ui-text-secondary)]">{home.unit}</span>
            </span>
            <span className="mt-1 block truncate text-[13px] text-[color:var(--ui-text-secondary)]">{t('navigation.quick.energyNow')}</span>
          </span>
          {solarShare !== null ? (
            <span className={`inline-flex h-[1.625rem] shrink-0 items-center rounded-full px-2.5 text-xs font-semibold ${QUICK_TONE_CLASSES.success}`}>
              {t('navigation.quick.energySolarShare', { percent: solarShare })}
            </span>
          ) : null}
        </div>
        {solarUsed + gridImport > 0 ? (
          <div aria-hidden="true" className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {solarUsed > 0 ? <span className="bg-[#ffb020]" style={{ flexGrow: solarUsed }} /> : null}
            {gridImport > 0 ? <span className="bg-[color:var(--ui-accent)]" style={{ flexGrow: gridImport }} /> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {solarW !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#ffb020]" />
              <span className="text-[color:var(--ui-text-secondary)]">{t('navigation.quick.energySolar')}</span>
              <span className="font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{formatPowerShort(solarW, locale)}</span>
            </span>
          ) : null}
          {gridW !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--ui-accent)]" />
              <span className="text-[color:var(--ui-text-secondary)]">
                {gridW < 0 ? t('navigation.quick.energyExport') : t('navigation.quick.energyGrid')}
              </span>
              <span className="font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{formatPowerShort(gridW, locale)}</span>
            </span>
          ) : null}
        </div>
      </>
    );
  };

  const renderWaste = () => {
    const next = data.waste;
    if (next === undefined) {
      return (
        <StatusRow
          icon={Recycle}
          title={t('navigation.quick.kind.waste')}
          detail={t('navigation.quick.wasteNotConfigured')}
          action={<PillButton onClick={() => open('/settings/home/waste-collection')}>{t('navigation.quick.open')}</PillButton>}
        />
      );
    }
    if (next === null) {
      return <StatusRow icon={Recycle} title={t('navigation.quick.wasteNone')} detail={t('navigation.quick.kind.waste')} />;
    }
    const day = formatCollectionDay(next.start, locale);
    return (
      <>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tracking-[-0.03em] text-[color:var(--ui-text-primary)]">
            {day.charAt(0).toLocaleUpperCase(locale)}
            {day.slice(1)}
          </span>
          <span className="min-w-0 truncate text-[13px] text-[color:var(--ui-text-secondary)]">{formatCollectionDate(next.start, locale)}</span>
        </div>
        {next.types.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {next.types.slice(0, 4).map((type) => (
              <span key={type.name} className={`flex min-w-0 items-center gap-2.5 rounded-2xl px-2.5 py-2 ${INNER_SURFACE}`}>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${type.color}2e`, color: type.color }}
                >
                  <Recycle size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{type.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[0.95rem] font-semibold text-[color:var(--ui-text-primary)]">{next.summary}</p>
        )}
      </>
    );
  };

  const body = {
    attention: renderAttention,
    alarm: renderAlarm,
    lights: renderLights,
    scenes: renderScenes,
    energy: renderEnergy,
    waste: renderWaste,
  }[kind]();

  return (
    <section aria-label={t(QUICK_KIND_LABELS[kind])} className={`space-y-2.5 rounded-[1.5rem] px-3.5 pb-3.5 pt-3 ${QUICK_GROUP_SURFACE}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
          <span className="truncate">{t(QUICK_KIND_LABELS[kind])}</span>
          {kind === 'attention' && attentionCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-1.5 text-[11px] font-bold tabular-nums text-[color:var(--ui-danger-contrast)]">
              {attentionCount}
            </span>
          ) : null}
        </span>
        {!preview && onChange ? (
          <button
            type="button"
            onClick={onChange}
            aria-label={t('navigation.quick.changeAria')}
            className="-my-2.5 -mr-2.5 inline-flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-[13px] font-semibold text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
          >
            {t('navigation.quick.change')}
          </button>
        ) : null}
      </div>
      {body}
    </section>
  );
}

const GALLERY_GROUPS: { titleKey: 'navigation.section.home' | 'navigation.security' | 'navigation.tile.consumption' | 'navigation.quick.group.calendar'; kinds: ShownKind[] }[] = [
  { titleKey: 'navigation.section.home', kinds: ['attention', 'lights', 'scenes'] },
  { titleKey: 'navigation.security', kinds: ['alarm'] },
  { titleKey: 'navigation.tile.consumption', kinds: ['energy'] },
  { titleKey: 'navigation.quick.group.calendar', kinds: ['waste'] },
];

/** The quick card gallery: every kind shown with the data right now, as in the widget gallery. */
export function SidebarQuickCardGallery({
  isOpen,
  kind,
  data,
  onPick,
  onClose,
}: {
  isOpen: boolean;
  kind: SidebarQuickCardKind;
  data: SidebarQuickCardData;
  onPick: (kind: SidebarQuickCardKind) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const baseId = React.useId();
  return (
    <GlassBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('navigation.quick.chooseTitle')}
      description={t('navigation.quick.galleryHint')}
      zIndex={330}
    >
      <div className="space-y-6 pb-2">
        {GALLERY_GROUPS.map((group) => (
          <section key={group.titleKey} aria-labelledby={`${baseId}-${group.titleKey}`} className="space-y-3">
            <h3 id={`${baseId}-${group.titleKey}`} className="px-1 text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
              {t(group.titleKey)}
            </h3>
            {group.kinds.map((option) => {
              const selected = option === kind;
              const label = t(QUICK_KIND_LABELS[option]);
              return (
                <div key={option} className="space-y-2">
                  <div className="flex min-h-6 items-center justify-between gap-2 px-1">
                    <span className="text-[0.95rem] font-semibold text-[color:var(--ui-text-primary)]">{label}</span>
                    {selected ? (
                      <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${QUICK_TONE_CLASSES.accent}`}>
                        <Check size={12} strokeWidth={3} aria-hidden="true" />
                        {t('navigation.quick.inUse')}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`relative rounded-[1.8rem] p-[5px] transition-shadow duration-200 ${
                      selected ? 'shadow-[inset_0_0_0_2.5px_var(--ui-accent)]' : ''
                    }`}
                  >
                    <div inert aria-hidden="true" className="pointer-events-none">
                      <SidebarQuickCard kind={option} data={data} preview />
                    </div>
                    <button
                      type="button"
                      onClick={() => onPick(option)}
                      aria-pressed={selected}
                      className="absolute inset-0 rounded-[1.8rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ui-focus-ring)]"
                    >
                      <span className="sr-only">{label}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <button
          type="button"
          onClick={() => onPick('none')}
          aria-pressed={kind === 'none'}
          className={`inline-flex min-h-12 w-full items-center justify-center rounded-full text-[0.95rem] font-semibold text-[color:var(--ui-danger)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] ${QUICK_GROUP_SURFACE}`}
        >
          {t('navigation.quick.noneOption')}
        </button>
      </div>
    </GlassBottomSheet>
  );
}
