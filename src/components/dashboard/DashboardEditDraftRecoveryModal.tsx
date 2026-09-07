import { FileClock, RotateCcw, Trash2 } from 'lucide-react';
import type { DashboardEditDraft } from '../../services/dashboardEditDraft';
import GlassButton from '../ui/GlassButton';
import GlassModal from '../ui/GlassModal';
import { useI18n } from '../../i18n/I18nProvider';

type DashboardEditDraftRecoveryModalProps = {
  draft: DashboardEditDraft | null;
  hasRevisionConflict: boolean;
  onResume: () => void;
  onDiscard: () => void;
};

export default function DashboardEditDraftRecoveryModal({
  draft,
  hasRevisionConflict,
  onResume,
  onDiscard,
}: DashboardEditDraftRecoveryModalProps) {
  const { formatDate, t } = useI18n();
  if (!draft) return null;
  const time = formatDate(draft.updatedAt, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <GlassModal
      isOpen
      dismissible={false}
      showCloseButton={false}
      onClose={() => {}}
      eyebrow={t('home.draft.eyebrow')}
      title={t('home.draft.title')}
      description={
        hasRevisionConflict
          ? t('home.draft.conflictDescription')
          : t('home.draft.description')
      }
      variant="responsive"
      size="md"
      zIndex={245}
      backdropClassName="!bg-black/60 !backdrop-blur-3xl"
      footerClassName="grid grid-cols-1 gap-2 sm:grid-cols-2"
      footer={
        <>
          <GlassButton size="md" onClick={onDiscard} className="w-full justify-center">
            <Trash2 size={16} />
            {t('home.draft.delete')}
          </GlassButton>
          <GlassButton size="md" variant="primary" onClick={onResume} className="w-full justify-center">
            <RotateCcw size={16} />
            {t('home.draft.resume')}
          </GlassButton>
        </>
      }
    >
      <div className="onboarding-notice">
        <span className="onboarding-notice-icon"><FileClock size={17} /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('home.draft.last')}</div>
          <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{t('home.draft.updatedAt', { date: time })}</p>
        </div>
      </div>
    </GlassModal>
  );
}
