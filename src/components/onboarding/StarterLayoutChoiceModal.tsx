import clsx from 'clsx';
import { AlertCircle, LayoutTemplate, LoaderCircle, SquareDashed } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import GlassModal from '../ui/GlassModal';
import {
  SetupActionButton,
  SetupSecondaryButton,
  useDeviceAppearance,
} from './OnboardingGlass';

type StarterLayoutChoiceModalProps = {
  isOpen: boolean;
  sectionCount: number;
  widgetCount: number;
  canStartEmpty: boolean;
  busy?: boolean;
  error?: string | null;
  onKeep: () => void;
  onStartEmpty: () => void;
};

export function StarterLayoutChoiceModal({
  isOpen,
  sectionCount,
  widgetCount,
  canStartEmpty,
  busy = false,
  error,
  onKeep,
  onStartEmpty,
}: StarterLayoutChoiceModalProps) {
  const { t } = useI18n();
  const appearance = useDeviceAppearance();
  const scopeClass = clsx(
    'onboarding-neutral-scope onboarding-accent-neutral',
    appearance === 'light' ? 'dashboard-theme-light' : 'dashboard-theme-dark',
  );

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={() => undefined}
      eyebrow={t('home.layoutChoice.eyebrow')}
      title={t('home.layoutChoice.title')}
      description={t('home.layoutChoice.description')}
      size="lg"
      variant="responsive"
      dismissible={false}
      showCloseButton={false}
      zIndex={290}
      className={scopeClass}
      panelClassName="onboarding-window !min-h-0 md:!h-auto"
      bodyClassName="!mt-5"
      footerClassName="border-t border-[color:var(--ui-border)]"
      backdropClassName="!bg-[color:var(--ui-scrim)]"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {canStartEmpty ? (
            <SetupSecondaryButton
              onClick={onStartEmpty}
              disabled={busy}
              className="sm:min-w-44"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <SquareDashed size={16} />}
              {t('home.layoutChoice.emptyAction')}
            </SetupSecondaryButton>
          ) : null}
          <SetupActionButton
            onClick={onKeep}
            disabled={busy}
            trailingArrow={false}
            className="sm:min-w-44"
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LayoutTemplate size={16} />}
            {t('home.layoutChoice.keepAction')}
          </SetupActionButton>
        </div>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="onboarding-choice-card onboarding-choice-card-active min-h-44">
          <span className="onboarding-choice-icon"><LayoutTemplate size={19} /></span>
          <h3 className="mt-5 font-semibold text-[color:var(--ui-text-primary)]">
            {t('home.layoutChoice.keepTitle')}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
            {t('home.layoutChoice.keepDescription', { sections: sectionCount, cards: widgetCount })}
          </p>
        </section>

        <section className={clsx('onboarding-choice-card min-h-44', !canStartEmpty && 'opacity-55')}>
          <span className="onboarding-choice-icon"><SquareDashed size={19} /></span>
          <h3 className="mt-5 font-semibold text-[color:var(--ui-text-primary)]">
            {t('home.layoutChoice.emptyTitle')}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
            {canStartEmpty
              ? t('home.layoutChoice.emptyDescription')
              : t('home.layoutChoice.permissionDescription')}
          </p>
        </section>
      </div>

      {error ? (
        <div role="alert" className="onboarding-notice mt-4 !border-rose-300/25 !bg-rose-500/10 !p-3.5">
          <span className="onboarding-notice-icon !h-8 !w-8 !text-rose-200"><AlertCircle size={15} /></span>
          <p className="min-w-0 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{error}</p>
        </div>
      ) : null}
    </GlassModal>
  );
}

export default StarterLayoutChoiceModal;
