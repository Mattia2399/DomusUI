import { useState, type ReactNode } from 'react';
import {
  Activity,
  Check,
  Cloud,
  DatabaseBackup,
  Home,
  LayoutGrid,
  LockKeyhole,
  Radio,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

export type SettingsPreviewMember = {
  id: string;
  name: string;
  avatarUrl?: string;
  presence: 'home' | 'away' | 'unknown';
};

type SettingsCardPreviewProps =
  | {
      variant: 'home';
      areas: Array<{ id: string; name: string }>;
      entityCount: number;
    }
  | {
      variant: 'people';
      members: SettingsPreviewMember[];
    }
  | {
      variant: 'dashboard';
      sectionCount: number;
      widgetCount: number;
      breakpointLabel: string;
    }
  | {
      variant: 'connection';
      connected: boolean;
      statusLabel: string;
    }
  | {
      variant: 'security';
      alarmCount: number;
      armedAlarmCount: number;
      lockCount: number;
      lockedLockCount: number;
    }
  | {
      variant: 'backup';
      lastBackupLabel: string | null;
      backupSizeLabel: string | null;
    }
  | {
      variant: 'system';
      statusLabel: string;
      tone: 'neutral' | 'ok' | 'warn' | 'danger';
      cpuPercent: number | null;
      ramPercent: number | null;
    }
  | {
      variant: 'advanced';
      version: string;
      developerMode: boolean;
    };

function PreviewFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`relative flex min-h-[4.4rem] w-full overflow-hidden rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:min-h-[4.9rem] sm:rounded-[1.15rem] sm:px-3.5 sm:py-3 ${className}`}
    >
      {children}
    </span>
  );
}

function MemberPreviewAvatar({ member }: { member: SettingsPreviewMember }) {
  const { t } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const initials =
    member.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';

  return (
    <span className="relative shrink-0" title={`${member.name} · ${member.presence === 'home' ? t('settings.preview.home') : member.presence === 'away' ? t('settings.preview.away') : t('settings.preview.presenceUnavailable')}`}>
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-[color:var(--ui-bg-elevated)] bg-[color:var(--ui-fill-secondary)] text-[9px] font-semibold text-[color:var(--ui-text-primary)] shadow-[0_7px_16px_var(--ui-shadow-soft)] sm:h-10 sm:w-10 sm:text-[10px]">
        {member.avatarUrl && !imageFailed ? (
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          initials
        )}
      </span>
      <span
        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--ui-bg-elevated)] sm:h-3 sm:w-3 ${
          member.presence === 'home'
            ? 'bg-emerald-500'
            : member.presence === 'away'
              ? 'bg-amber-400'
              : 'bg-[color:var(--ui-text-tertiary)]'
        }`}
      />
    </span>
  );
}

function MiniMetricBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const normalized = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <span className="block min-w-0 flex-1">
      <span className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">
        <span>{label}</span>
        <span>{value === null ? 'ND' : `${Math.round(value)}%`}</span>
      </span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[color:var(--ui-separator)]">
        <span
          className="block h-full rounded-full bg-[color:rgb(var(--ui-accent-rgb)/0.82)] transition-[width] duration-500"
          style={{ width: `${normalized}%` }}
        />
      </span>
    </span>
  );
}

export function SettingsCardPreview(props: SettingsCardPreviewProps) {
  const { t } = useI18n();
  if (props.variant === 'home') {
    return (
      <PreviewFrame className="items-center gap-3">
        <Home size={17} className="shrink-0 text-[color:var(--ui-text-secondary)]" />
        <span className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
          {props.areas.length > 0 ? (
            props.areas.slice(0, 3).map((area, index) => (
              <span
                key={area.id}
                className={`block truncate rounded-lg px-2 py-2 text-center text-[10px] font-semibold text-[color:var(--ui-text-secondary)] ${
                  index === 1
                    ? 'bg-[color:var(--ui-fill-secondary)]'
                    : 'bg-[color:var(--ui-surface-glass)]'
                }`}
              >
                {area.name}
              </span>
            ))
          ) : (
            <span className="col-span-3 text-xs text-[color:var(--ui-text-secondary)]">
              {t('settings.preview.noRooms')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold text-[color:var(--ui-text-primary)]">{props.entityCount}</span>
          <span className="block text-[9px] uppercase tracking-[0.1em] text-[color:var(--ui-text-secondary)]">{t('settings.preview.entities')}</span>
        </span>
      </PreviewFrame>
    );
  }

  if (props.variant === 'people') {
    const homeCount = props.members.filter((member) => member.presence === 'home').length;
    return (
      <PreviewFrame className="items-center justify-between gap-3">
        <span className="flex min-w-0 -space-x-2 [&>span:nth-child(n+4)]:hidden sm:[&>span:nth-child(n+4)]:block">
          {props.members.length > 0 ? (
            props.members.slice(0, 4).map((member) => (
              <MemberPreviewAvatar key={member.id} member={member} />
            ))
          ) : (
            <span className="flex items-center gap-2 text-xs text-[color:var(--ui-text-secondary)]">
              <UserRound size={15} />
              {t('settings.preview.noMembers')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold text-[color:var(--ui-text-primary)]">{homeCount}</span>
          <span className="block text-[9px] uppercase tracking-[0.1em] text-[color:var(--ui-text-secondary)]">{t('settings.preview.atHome')}</span>
        </span>
      </PreviewFrame>
    );
  }

  if (props.variant === 'dashboard') {
    const tileCount = Math.min(8, props.widgetCount);
    return (
      <PreviewFrame className="items-center gap-3">
        <LayoutGrid size={17} className="hidden shrink-0 text-[color:var(--ui-text-secondary)] sm:block" />
        {tileCount > 0 ? (
          <span className="grid min-w-0 flex-1 grid-cols-6 gap-1">
            {Array.from({ length: tileCount }, (_, index) => (
              <span
                key={index}
                className={`block h-4 rounded-[0.3rem] bg-[color:var(--ui-fill-secondary)] ${
                  index % 3 === 0 ? 'col-span-3' : index % 2 === 0 ? 'col-span-2' : 'col-span-1'
                }`}
              />
            ))}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-xs text-[color:var(--ui-text-secondary)]">
            {t('settings.preview.emptyCanvas')}
          </span>
        )}
        <span className="shrink-0 rounded-full bg-[color:var(--ui-surface-glass)] px-1.5 py-1 text-[9px] font-semibold text-[color:var(--ui-text-secondary)] sm:px-2.5 sm:text-[10px]">
          {props.breakpointLabel}
        </span>
      </PreviewFrame>
    );
  }

  if (props.variant === 'connection') {
    return (
      <PreviewFrame className="items-center justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)]">
          <LayoutGrid size={15} />
        </span>
        <span className="relative mx-1 h-px min-w-8 flex-1 bg-[color:var(--ui-separator)]">
          <span
            className={`absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
              props.connected ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'
            }`}
          />
        </span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            props.connected
              ? 'bg-emerald-500/12 text-emerald-500'
              : 'bg-amber-500/12 text-amber-500'
          }`}
        >
          <Radio size={15} />
        </span>
        <span className="ml-1 hidden max-w-[42%] truncate text-[10px] font-semibold text-[color:var(--ui-text-secondary)] sm:block">
          {props.statusLabel}
        </span>
      </PreviewFrame>
    );
  }

  if (props.variant === 'security') {
    const hasWarning = props.lockCount > props.lockedLockCount;
    if (props.alarmCount === 0 && props.lockCount === 0) {
      return (
        <PreviewFrame className="items-center gap-3">
          <ShieldCheck size={18} className="shrink-0 text-[color:var(--ui-text-secondary)]" />
          <span className="text-xs text-[color:var(--ui-text-secondary)]">
            {t('settings.preview.noSecurityEntities')}
          </span>
        </PreviewFrame>
      );
    }
    return (
      <PreviewFrame className="items-center gap-3">
        <span
          className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full sm:flex ${
            hasWarning
              ? 'bg-amber-500/12 text-amber-500'
              : 'bg-emerald-500/12 text-emerald-500'
          }`}
        >
          <ShieldCheck size={18} />
        </span>
        <span className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <span>
            <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {props.alarmCount > 0 ? `${props.armedAlarmCount}/${props.alarmCount}` : 'ND'}
            </span>
            <span className="block text-[9px] uppercase tracking-[0.08em] text-[color:var(--ui-text-secondary)]">{t('settings.preview.armedAlarms')}</span>
          </span>
          <span>
            <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {props.lockCount > 0 ? `${props.lockedLockCount}/${props.lockCount}` : 'ND'}
            </span>
            <span className="block text-[9px] uppercase tracking-[0.08em] text-[color:var(--ui-text-secondary)]">{t('settings.preview.lockedLocks')}</span>
          </span>
        </span>
      </PreviewFrame>
    );
  }

  if (props.variant === 'backup') {
    return (
      <PreviewFrame className="items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)]">
          <DatabaseBackup size={17} />
          {props.lastBackupLabel ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={10} strokeWidth={3} />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">
            {props.lastBackupLabel ?? t('settings.preview.noBackup')}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-secondary)]">
            {props.backupSizeLabel ?? t('settings.preview.sizeUnavailable')}
          </span>
        </span>
        <Cloud size={15} className="hidden shrink-0 text-[color:var(--ui-text-tertiary)] sm:block" />
      </PreviewFrame>
    );
  }

  if (props.variant === 'system') {
    const toneClass =
      props.tone === 'danger'
        ? 'bg-rose-500'
        : props.tone === 'warn'
          ? 'bg-amber-500'
          : props.tone === 'ok'
            ? 'bg-emerald-500'
            : 'bg-[color:var(--ui-text-tertiary)]';
    return (
      <PreviewFrame className="flex-col justify-center gap-3">
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">
            <Activity size={14} />
            {props.statusLabel}
          </span>
          <span className={`h-2 w-2 rounded-full ${toneClass}`} />
        </span>
        <span className="flex gap-3">
          <MiniMetricBar label="CPU" value={props.cpuPercent} />
          <MiniMetricBar label="RAM" value={props.ramPercent} />
        </span>
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame className="items-center gap-3">
      <Wrench size={17} className="shrink-0 text-[color:var(--ui-text-secondary)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[color:var(--ui-text-primary)]">
          {t('settings.preview.version', { version: props.version })}
        </span>
        <span className="mt-0.5 block text-[10px] text-[color:var(--ui-text-secondary)]">
          {t('settings.preview.technicalTools')}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
          props.developerMode
            ? 'bg-amber-500/12 text-amber-500'
            : 'bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)]'
        }`}
      >
        Dev {props.developerMode ? 'On' : 'Off'}
      </span>
    </PreviewFrame>
  );
}

export default SettingsCardPreview;
