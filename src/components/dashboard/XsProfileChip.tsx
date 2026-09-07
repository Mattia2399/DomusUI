import type { HaConnectionStatus } from '../../services/haConnectionState';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';
import { useI18n } from '../../i18n/I18nProvider';

type XsProfileChipProps = {
  userAvatarUrl?: string;
  userName?: string;
  haStatus: HaConnectionStatus;
  onOpenProfile: () => void;
};

export function XsProfileChip({
  userAvatarUrl,
  userName,
  haStatus,
  onOpenProfile,
}: XsProfileChipProps) {
  const { t } = useI18n();
  const normalizedName = userName?.trim() ?? '';

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="liquid-glass-control group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-1.5 text-[color:var(--ui-text-primary)] transition-all hover:brightness-110 active:scale-95"
      aria-label={normalizedName ? t('navigation.profile.openFor', { name: normalizedName }) : t('navigation.profile.open')}
      title={normalizedName || t('navigation.profile.title')}
    >
      <span className="relative inline-flex h-8 w-8 shrink-0">
        <DashboardProfileAvatar
          userAvatarUrl={userAvatarUrl}
          userName={normalizedName}
          haStatus={haStatus}
          size="sm"
        />
      </span>
    </button>
  );
}
