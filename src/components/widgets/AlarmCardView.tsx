import React from 'react';
import {
  House,
  Moon,
  Plane,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldEllipsis,
  ShieldPlus,
  ShieldQuestion,
  X,
} from 'lucide-react';
import type { AlarmArmMode, AlarmCardModel, AlarmCardTone } from './alarmCardModel';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

type AlarmCardViewProps = {
  model: AlarmCardModel;
  layoutVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  isModeMenuOpen: boolean;
  selectedArmMode?: AlarmArmMode;
  rootRef: React.Ref<HTMLDivElement>;
  onOpen: () => void;
  onOpenModeMenu: () => void;
  onCloseModeMenu: () => void;
  onSelectArmMode: (mode: AlarmArmMode) => void;
  onConfirmArm: () => void;
  onDisarm: () => void;
  onArm: (mode: AlarmArmMode) => void;
};

const MODE_LABEL_KEYS: Record<AlarmArmMode, TranslationKey> = {
  home: 'alarm.mode.home', away: 'alarm.mode.away', night: 'alarm.mode.night',
  vacation: 'alarm.mode.vacation', custom_bypass: 'alarm.mode.customBypass',
};
const MODE_DESCRIPTION_KEYS: Record<AlarmArmMode, TranslationKey> = {
  home: 'alarm.modeDescription.home', away: 'alarm.modeDescription.away', night: 'alarm.modeDescription.night',
  vacation: 'alarm.modeDescription.vacation', custom_bypass: 'alarm.modeDescription.customBypass',
};
const STATE_KEYS: Record<string, TranslationKey> = {
  disarmed: 'alarm.state.disarmed', armed_home: 'alarm.state.armedHome', armed_away: 'alarm.state.armedAway',
  armed_night: 'alarm.state.armedNight', armed_vacation: 'alarm.state.armedVacation', armed_custom_bypass: 'alarm.state.armedCustomBypass',
  pending: 'alarm.state.pending', arming: 'alarm.state.arming', disarming: 'alarm.state.disarming',
  triggered: 'alarm.state.triggered', unavailable: 'alarm.state.unavailable', unknown: 'alarm.state.unknown',
};

function resolveStateIcon(model: AlarmCardModel) {
  if (model.isTriggered) return ShieldAlert;
  if (model.isTransitioning) return ShieldEllipsis;
  if (model.isUnavailable) return ShieldQuestion;
  if (model.state === 'disarmed') return ShieldBan;
  return Shield;
}

function resolveModeIcon(mode: AlarmArmMode, size = 17) {
  if (mode === 'home') return <House size={size} />;
  if (mode === 'night') return <Moon size={size} />;
  if (mode === 'vacation') return <Plane size={size} />;
  if (mode === 'custom_bypass') return <ShieldPlus size={size} />;
  return <Shield size={size} />;
}

function resolveAccent(tone: AlarmCardTone) {
  if (tone === 'danger') return {
    surface: 'bg-[linear-gradient(145deg,rgba(98,36,54,0.52)_0%,rgba(50,24,35,0.48)_46%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(251,113,133,0.20),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(244,63,94,0.14),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-rose-300/90', glow: 'bg-rose-400/24', icon: 'text-rose-200', action: 'bg-rose-400/[0.16] border-rose-200/24 hover:bg-rose-400/[0.22]', progress: 'bg-rose-300/80', selectedMode: 'border-rose-200/30 bg-rose-300/[0.16] text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(244,63,94,0.18)]',
  };
  if (tone === 'home') return {
    surface: 'bg-[linear-gradient(145deg,rgba(35,88,75,0.58)_0%,rgba(24,63,58,0.46)_45%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(110,231,183,0.18),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(16,185,129,0.12),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-emerald-300/82', glow: 'bg-emerald-400/20', icon: 'text-emerald-200', action: 'bg-emerald-300/[0.11] border-emerald-100/14 hover:bg-emerald-300/[0.16]', progress: 'bg-emerald-300/76', selectedMode: 'border-emerald-200/28 bg-emerald-300/[0.15] text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(16,185,129,0.16)]',
  };
  if (tone === 'away') return {
    surface: 'bg-[linear-gradient(145deg,rgba(34,70,112,0.58)_0%,rgba(25,45,78,0.46)_46%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(147,197,253,0.19),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(59,130,246,0.13),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-blue-300/84', glow: 'bg-blue-400/21', icon: 'text-blue-200', action: 'bg-blue-300/[0.11] border-blue-100/14 hover:bg-blue-300/[0.16]', progress: 'bg-blue-300/78', selectedMode: 'border-blue-200/28 bg-blue-300/[0.15] text-blue-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(59,130,246,0.16)]',
  };
  if (tone === 'night') return {
    surface: 'bg-[linear-gradient(145deg,rgba(55,52,116,0.56)_0%,rgba(34,32,82,0.48)_46%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(165,180,252,0.19),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(99,102,241,0.14),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-indigo-300/84', glow: 'bg-indigo-400/22', icon: 'text-indigo-200', action: 'bg-indigo-300/[0.11] border-indigo-100/14 hover:bg-indigo-300/[0.16]', progress: 'bg-indigo-300/78', selectedMode: 'border-indigo-200/28 bg-indigo-300/[0.15] text-indigo-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(99,102,241,0.17)]',
  };
  if (tone === 'vacation') return {
    surface: 'bg-[linear-gradient(145deg,rgba(101,70,35,0.56)_0%,rgba(72,45,24,0.46)_46%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(252,211,77,0.18),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(245,158,11,0.13),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-amber-300/80', glow: 'bg-amber-400/20', icon: 'text-amber-200', action: 'bg-amber-300/[0.11] border-amber-100/14 hover:bg-amber-300/[0.16]', progress: 'bg-amber-300/76', selectedMode: 'border-amber-200/28 bg-amber-300/[0.15] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(245,158,11,0.16)]',
  };
  if (tone === 'bypass') return {
    surface: 'bg-[linear-gradient(145deg,rgba(28,86,101,0.54)_0%,rgba(22,61,73,0.46)_46%,rgba(255,255,255,0.026)_100%)]',
    wash: 'bg-[radial-gradient(78%_70%_at_12%_0%,rgba(103,232,249,0.17),transparent_62%),radial-gradient(70%_75%_at_100%_100%,rgba(6,182,212,0.12),transparent_68%),radial-gradient(80%_70%_at_8%_0%,rgba(255,255,255,0.10),transparent_64%)]',
    line: 'via-cyan-300/80', glow: 'bg-cyan-400/19', icon: 'text-cyan-200', action: 'bg-cyan-300/[0.10] border-cyan-100/14 hover:bg-cyan-300/[0.15]', progress: 'bg-cyan-300/76', selectedMode: 'border-cyan-200/28 bg-cyan-300/[0.14] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_3px_12px_rgba(6,182,212,0.15)]',
  };
  return {
    surface: 'bg-[color:var(--ui-surface-glass)]',
    wash: 'bg-[radial-gradient(80%_70%_at_8%_0%,rgb(var(--ui-glass-highlight-rgb)/0.10),transparent_64%)]',
    line: 'via-[color:var(--ui-border-strong)]',
    glow: 'bg-[color:var(--ui-fill-tertiary)]',
    icon: 'text-[color:var(--ui-text-tertiary)]',
    action: 'bg-[color:var(--ui-fill-tertiary)] border-[color:var(--ui-border)] hover:bg-[color:var(--ui-fill-secondary)]',
    progress: 'bg-[color:var(--ui-fill-primary)]',
    selectedMode: 'border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)] shadow-[0_3px_10px_var(--ui-shadow-soft)]',
  };
}

function stateCaption(model: AlarmCardModel, t: (key: TranslationKey) => string) {
  if (model.isTriggered) return t('alarm.caption.triggered');
  if (model.isTransitioning) return t('alarm.caption.transitioning');
  if (model.isUnavailable) return t('alarm.caption.unavailable');
  const active = model.supportedModes.find((mode) => mode.id === model.activeMode);
  if (active) return t(MODE_DESCRIPTION_KEYS[active.id]);
  return t('alarm.caption.disarmed');
}

export function AlarmCardView({
  model,
  layoutVariant,
  isSelected,
  isEditMode,
  isModeMenuOpen,
  selectedArmMode,
  rootRef,
  onOpen,
  onOpenModeMenu,
  onCloseModeMenu,
  onSelectArmMode,
  onConfirmArm,
  onDisarm,
  onArm,
}: AlarmCardViewProps) {
  const { t } = useI18n();
  const isCompact = layoutVariant === 'compact' || layoutVariant === 'mini';
  const isFull = layoutVariant === 'full';
  const StateIcon = resolveStateIcon(model);
  const accent = resolveAccent(model.tone);
  const radiusClass = isCompact ? 'rounded-[1.2rem]' : isFull ? 'rounded-[2rem]' : 'rounded-[1.85rem]';
  const selectedMode = selectedArmMode ? model.supportedModes.find((mode) => mode.id === selectedArmMode) : undefined;
  const selectedIsActive = Boolean(selectedArmMode && selectedArmMode === model.activeMode);
  const usesSemanticSurface = model.tone === 'neutral' || model.tone === 'unavailable';
  const primaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-primary)]' : 'text-white';
  const secondaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-secondary)]' : 'text-white/58';
  const tertiaryTextClass = usesSemanticSurface ? 'text-[color:var(--ui-text-tertiary)]' : 'text-white/42';
  const neutralFillClass = usesSemanticSurface ? 'bg-[color:var(--ui-fill-tertiary)]' : 'bg-white/[0.055]';
  const localizedState = t(STATE_KEYS[model.state] ?? 'alarm.state.unknown');
  const localizedModeLabel = (mode?: AlarmArmMode) => mode ? t(MODE_LABEL_KEYS[mode]) : t('alarm.system');

  const actionLabel = model.isTriggered
    ? t('alarm.action.disable')
    : model.isTransitioning
      ? t('alarm.action.pending')
      : model.isUnavailable || model.primaryAction === 'none'
        ? t('alarm.action.unavailable')
        : model.state === 'disarmed'
          ? isFull
            ? t('alarm.action.armNamed', { mode: localizedModeLabel(selectedMode?.id) })
            : t('alarm.action.arm')
          : isFull && selectedArmMode && !selectedIsActive
            ? t('alarm.action.switchTo', { mode: localizedModeLabel(selectedMode?.id) })
            : t('alarm.action.disarm');

  const runAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (model.isTriggered || (model.state !== 'disarmed' && (!isFull || selectedIsActive))) {
      onDisarm();
      return;
    }
    if (isFull) {
      onConfirmArm();
      return;
    }
    onOpenModeMenu();
  };

  const actionButton = (compact = false) => (
    <button
      type="button"
      onClick={runAction}
      disabled={model.primaryAction === 'none' || model.isTransitioning}
      className={`${compact ? 'h-[2.36rem] text-[0.72rem]' : isFull ? 'h-9 text-[0.74rem]' : 'h-10 text-xs'} flex w-full shrink-0 items-center justify-center rounded-full border px-3 font-semibold ${primaryTextClass} shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.16)] backdrop-blur-xl transition active:scale-[0.985] disabled:cursor-default disabled:opacity-45 ${accent.action}`}
      aria-label={actionLabel}
    >
      <span className="truncate">{actionLabel}</span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      data-alarm-variant={isCompact ? 'compact' : isFull ? 'full' : 'standard'}
      className={`relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden ${radiusClass} ${isSelected ? 'selection-corners' : ''}`}
      onClick={(event) => {
        if (isEditMode) return;
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${model.title}, ${localizedState}`}
      aria-busy={model.isTransitioning || undefined}
    >
      <div className={`relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border border-[color:var(--ui-border)] ${accent.surface} shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.16),0_14px_34px_var(--ui-shadow-soft)] backdrop-blur-[28px] backdrop-saturate-[1.35] ${radiusClass} ${isCompact ? 'p-3' : 'p-3.5'} ${isEditMode ? 'pointer-events-none' : ''}`}>
        <div className={`pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent ${accent.line} to-transparent`} />
        <div className={`pointer-events-none absolute -top-8 left-1/2 h-16 w-36 -translate-x-1/2 rounded-full blur-[30px] ${accent.glow}`} />
        <div className={`pointer-events-none absolute inset-0 ${radiusClass} ${accent.wash}`} />

        {model.isTransitioning ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-[color:var(--ui-fill-tertiary)]">
            <div className={`h-full w-1/2 animate-[alarm-progress_1.4s_ease-in-out_infinite] rounded-full ${accent.progress}`} />
          </div>
        ) : null}

        {isCompact ? (
          <>
            <div className="relative z-10 flex min-w-0 items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${neutralFillClass} shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.10)]`}>
                <StateIcon size={18} className={accent.icon} />
              </div>
              <div className="min-w-0">
                <h2 className={`truncate text-[0.86rem] font-semibold leading-tight tracking-[-0.01em] ${primaryTextClass}`}>{model.title}</h2>
                <p className={`mt-0.5 truncate text-[0.68rem] font-medium ${model.isTriggered ? 'text-rose-200' : tertiaryTextClass}`}>{localizedState}</p>
              </div>
            </div>
            <div className="relative z-10 mt-auto">{actionButton(true)}</div>
          </>
        ) : (
          <>
            <div className="relative z-10 flex min-w-0 items-center justify-between gap-3">
              <span
                className={`min-w-0 truncate ${
                  isFull
                    ? `text-[0.62rem] font-semibold uppercase tracking-[0.14em] ${tertiaryTextClass}`
                    : `text-[0.86rem] font-semibold tracking-[-0.01em] ${primaryTextClass}`
                }`}
              >
                {isFull ? t('alarm.card.systemStatus') : model.title}
              </span>
              <StateIcon size={17} className={`shrink-0 ${accent.icon} ${model.isTransitioning ? 'animate-pulse' : ''}`} />
            </div>

            <div className={`relative z-10 ${isFull ? 'mt-2.5' : 'my-auto'} min-w-0`}>
              <p className={`${isFull ? 'text-[1.48rem]' : 'text-[1.35rem]'} truncate font-bold leading-none tracking-[-0.035em] ${primaryTextClass}`}>{localizedState.toLocaleUpperCase()}</p>
              <p className={`${isFull ? 'mt-1' : 'mt-1.5'} truncate text-[0.68rem] font-medium ${tertiaryTextClass}`}>{stateCaption(model, t)}</p>
            </div>

            {isFull && !model.isTriggered && !model.isUnavailable && model.supportedModes.length > 0 ? (
              <div className="relative z-10 mt-2.5" onClick={(event) => event.stopPropagation()}>
                <GlassSegmentSelect
                  ariaLabel={t('alarm.card.modeAria')}
                  options={model.supportedModes.map((mode) => ({
                    value: mode.id,
                    label: resolveModeIcon(mode.id, 15),
                    ariaLabel: t('alarm.card.selectModeAria', { mode: localizedModeLabel(mode.id) }),
                    title: localizedModeLabel(mode.id),
                  }))}
                  value={selectedArmMode}
                  onChange={onSelectArmMode}
                  disabled={model.isTransitioning}
                  minOptionWidth="2.35rem"
                  scrollable
                  optionClassName="h-8 border border-transparent px-1.5"
                />
              </div>
            ) : null}

            {isFull && !model.isTriggered ? (
              <div className={`relative z-10 mt-2 space-y-1 text-[0.6rem] leading-tight ${tertiaryTextClass}`}>
                <p className="truncate"><span className={secondaryTextClass}>{t('alarm.card.lastChanged')}</span> {model.changedBy ?? t('alarm.card.synchronized')}</p>
                <p className="truncate"><span className={secondaryTextClass}>{t('alarm.card.security')}</span> {model.armActionLocked || model.disarmActionLocked ? t('alarm.card.authorizationRequired') : t('alarm.card.quickAccess')}</p>
              </div>
            ) : null}

            <div className={`relative z-10 ${isFull ? 'mt-auto pt-2.5' : 'mt-auto border-t border-[color:var(--ui-border)] pt-3'}`}>{actionButton()}</div>
          </>
        )}

        {isModeMenuOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('alarm.card.chooseModeAria')}
            tabIndex={-1}
            className={`absolute inset-0 z-40 flex min-h-0 flex-col overflow-hidden ${radiusClass} border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass-strong)] p-2 text-[color:var(--ui-text-primary)] shadow-[inset_0_1px_0_rgb(var(--ui-glass-highlight-rgb)/0.22),0_18px_44px_var(--ui-shadow)] backdrop-blur-[30px] backdrop-saturate-[1.45]`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCloseModeMenu();
            }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_68%_at_12%_0%,rgb(var(--ui-glass-highlight-rgb)/0.18),transparent_58%)]" />
            <div aria-hidden="true" className="pointer-events-none absolute -left-[12%] -top-[34%] h-[62%] w-[72%] rotate-[-10deg] rounded-[50%] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] blur-[1px]" />
            <div className="relative z-10 mb-1.5 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{t('alarm.card.chooseMode')}</p>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] shadow-[0_5px_16px_var(--ui-shadow-soft)] backdrop-blur-xl transition hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-95"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseModeMenu();
                }}
                aria-label={t('alarm.card.closeModeAria')}
              >
                <X size={15} />
              </button>
            </div>
            <div className="relative z-10 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {model.supportedModes.map((mode) => {
                const active = selectedArmMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`flex min-h-[2.6rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-1 text-center transition-all active:scale-[0.96] ${
                      active
                        ? 'border-[color:rgb(var(--ui-accent-rgb)/0.52)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)] text-[color:var(--ui-text-primary)] shadow-[0_10px_24px_rgb(var(--ui-accent-rgb)/0.16)] backdrop-blur-2xl'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] backdrop-blur-xl hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectArmMode(mode.id);
                      onArm(mode.id);
                    }}
                    aria-pressed={active}
                    aria-label={t('alarm.card.armModeAria', { mode: localizedModeLabel(mode.id) })}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">{resolveModeIcon(mode.id, 17)}</span>
                    <span className="max-w-full truncate text-[0.64rem] font-semibold">{localizedModeLabel(mode.id)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {isEditMode ? (
        <div
          role="button"
          tabIndex={0}
          className={`widget-card-handle absolute inset-0 cursor-grab ${radiusClass}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onOpen();
            }
          }}
          aria-label={t('alarm.card.openAria', { name: model.title })}
        />
      ) : null}
    </div>
  );
}
