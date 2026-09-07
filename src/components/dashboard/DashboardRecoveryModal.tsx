import { History, RotateCcw, ShieldCheck } from 'lucide-react';
import type { DashboardRecoverySnapshot } from '../../services/dashboardRecovery';
import GlassButton from '../ui/GlassButton';
import GlassModal from '../ui/GlassModal';
import { useI18n } from '../../i18n/I18nProvider';

type DashboardRecoveryModalProps = {
  snapshot: DashboardRecoverySnapshot | null;
  onKeepCurrent: () => void;
  onRestore: () => void;
};

export function DashboardRecoveryModal({
  snapshot,
  onKeepCurrent,
  onRestore,
}: DashboardRecoveryModalProps) {
  const { t, formatDate } = useI18n();
  if (!snapshot) {
    return null;
  }

  const snapshotTime = formatDate(snapshot.createdAt, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <GlassModal
      isOpen
      onClose={() => {}}
      dismissible={false}
      showCloseButton={false}
      variant="responsive"
      size="md"
      eyebrow={t('home.recovery.eyebrow')}
      title={t('home.recovery.title')}
      description={t('home.recovery.description')}
      backdropClassName="!bg-black/55 !backdrop-blur-3xl"
      footerClassName="grid grid-cols-1 gap-2 sm:grid-cols-2"
      footer={
        <>
          <GlassButton size="md" onClick={onKeepCurrent} className="w-full justify-center">
            <ShieldCheck size={16} />
            {t('home.recovery.keep')}
          </GlassButton>
          <GlassButton size="md" variant="primary" onClick={onRestore} className="w-full justify-center">
            <RotateCcw size={16} />
            {t('home.recovery.restore')}
          </GlassButton>
        </>
      }
    >
      <div className="onboarding-notice">
        <span className="onboarding-notice-icon"><History size={17} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('home.recovery.lastStable')}</div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
            {t('home.recovery.created', { date: snapshotTime })}
          </p>
        </div>
      </div>
    </GlassModal>
  );
}

export default DashboardRecoveryModal;
