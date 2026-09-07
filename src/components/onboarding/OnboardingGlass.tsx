import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  ListChecks,
  PanelsTopLeft,
  Sparkles,
} from 'lucide-react';
import { GlassButton } from '../ui/GlassButton';
import { useI18n } from '../../i18n/I18nProvider';
import { translateOnboarding } from '../../i18n/onboardingTranslations';

const SETUP_STEPS = [
  { labelKey: 'wizard.connection', icon: Link2 },
  { labelKey: 'wizard.analysis', icon: ListChecks },
  { labelKey: 'wizard.layout', icon: PanelsTopLeft },
  { labelKey: 'wizard.organize', icon: Sparkles },
] as const;

type DeviceAppearance = 'dark' | 'light';

function readDeviceAppearance(): DeviceAppearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useDeviceAppearance() {
  const [appearance, setAppearance] = useState<DeviceAppearance>(readDeviceAppearance);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (event: MediaQueryListEvent) => setAppearance(event.matches ? 'light' : 'dark');
    setAppearance(mediaQuery.matches ? 'light' : 'dark');
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dashboard-theme-light', appearance === 'light');
    root.classList.toggle('dashboard-theme-dark', appearance === 'dark');
    root.dataset.dashboardAppearance = appearance;
    root.style.colorScheme = appearance;
  }, [appearance]);

  return appearance;
}

export function SetupBackdrop({ children }: { children: ReactNode }) {
  const appearance = useDeviceAppearance();

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.documentElement.classList.add('onboarding-neutral-root');
    return () => document.documentElement.classList.remove('onboarding-neutral-root');
  }, []);

  return (
    <main
      data-appearance-source="device"
      className={clsx(
        'apple-bg-main dashboard-shell onboarding-backdrop relative h-[100dvh] min-h-[100dvh] overflow-hidden font-sans text-[color:var(--dashboard-text)]',
        appearance === 'light' ? 'dashboard-theme-light' : 'dashboard-theme-dark',
        'onboarding-accent-neutral',
      )}
    >
      <div className="dashboard-background-layer" aria-hidden />
      <div className="onboarding-ambient-light" aria-hidden />
      <div className="glass-scrollbar relative z-10 h-full overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center px-0 py-0 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </main>
  );
}

type SetupActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  trailingArrow?: boolean;
  fullOnMobile?: boolean;
};

export function SetupActionButton({
  children,
  className,
  trailingArrow = true,
  fullOnMobile = true,
  ...props
}: SetupActionButtonProps) {
  return (
    <GlassButton
      variant="primary"
      className={clsx(
        'onboarding-primary-button group min-h-12 rounded-full px-5 text-sm font-semibold',
        fullOnMobile && 'w-full sm:w-auto',
        className,
      )}
      {...props}
    >
      {children}
      {trailingArrow ? (
        <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
      ) : null}
    </GlassButton>
  );
}

export function SetupSecondaryButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <GlassButton
      variant="default"
      className={clsx('min-h-12 rounded-full px-5 text-sm text-[color:var(--ui-text-primary)]', className)}
      {...props}
    >
      {children}
    </GlassButton>
  );
}

export function SetupBackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const { locale } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-10 items-center gap-2 rounded-full px-1 text-sm font-medium text-[color:var(--ui-text-secondary)] transition hover:text-[color:var(--ui-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15',
        className,
      )}
    >
      <ArrowLeft size={16} />
      {translateOnboarding(locale, 'common.back')}
    </button>
  );
}

export function WizardActions({ children }: { children: ReactNode }) {
  return (
    <div className="onboarding-actions mt-7 flex flex-col-reverse gap-2 border-t border-[color:var(--ui-border)] pt-5 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}

type WizardShellProps = {
  stepIndex: number;
  stepLabel?: string;
  title: string;
  description: string;
  children: ReactNode;
  onBack?: () => void;
  compact?: boolean;
};

export function WizardShell({
  stepIndex,
  stepLabel,
  title,
  description,
  children,
  onBack,
  compact = false,
}: WizardShellProps) {
  const { locale } = useI18n();
  const ot = (key: Parameters<typeof translateOnboarding>[1], parameters?: Record<string, string | number>) =>
    translateOnboarding(locale, key, parameters);
  const safeStep = Math.max(0, Math.min(stepIndex, SETUP_STEPS.length));
  const displayStep = safeStep >= SETUP_STEPS.length ? SETUP_STEPS.length : safeStep + 1;
  const progress = safeStep >= SETUP_STEPS.length ? 100 : ((safeStep + 1) / SETUP_STEPS.length) * 100;

  return (
    <SetupBackdrop>
      <section className={clsx('onboarding-window w-full', compact ? 'max-w-3xl' : 'max-w-5xl')}>
        <aside className="onboarding-step-rail hidden lg:flex">
          <div className="space-y-2">
            {SETUP_STEPS.map((entry, index) => {
              const Icon = entry.icon;
              const complete = safeStep > index;
              const active = safeStep === index;
              return (
                <div
                  key={entry.labelKey}
                  className={clsx(
                    'onboarding-step-item',
                    active && 'onboarding-step-item-active',
                    complete && 'onboarding-step-item-complete',
                  )}
                >
                  <span className="onboarding-step-icon">
                    {complete ? <Check size={14} strokeWidth={2.5} /> : <Icon size={15} />}
                  </span>
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-50">
                      {ot('wizard.step', { step: index + 1 })}
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold">{ot(entry.labelKey)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-auto text-xs leading-5 text-[color:var(--ui-text-secondary)]">
            {ot('wizard.backHint')}
          </p>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="onboarding-mobile-header lg:hidden">
            <span className="col-start-2 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
              {stepLabel ?? ot('wizard.counter', { current: displayStep, total: SETUP_STEPS.length })}
            </span>
            <div className="onboarding-progress-track" aria-hidden>
              <span style={{ width: `${progress}%` }} />
            </div>
          </header>

          <div className="onboarding-content">
            <div className="hidden items-center justify-between gap-4 lg:flex">
              {onBack ? <SetupBackButton onClick={onBack} /> : <span />}
              <span className="onboarding-step-chip">
                {stepLabel ?? ot('wizard.counter', { current: displayStep, total: SETUP_STEPS.length })}
              </span>
            </div>
            {onBack ? <SetupBackButton onClick={onBack} className="mb-3 lg:hidden" /> : null}

            <div className="max-w-2xl">
              <h1 className="text-[clamp(1.8rem,5vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[color:var(--ui-text-primary)]">
                {title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)] sm:text-base">
                {description}
              </p>
            </div>

            <div className="mt-7 sm:mt-8">{children}</div>
          </div>
        </div>
      </section>
    </SetupBackdrop>
  );
}

export function ReconnectShell({
  title,
  description,
  children,
  onBack,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onBack: () => void;
}) {
  const { locale } = useI18n();
  return (
    <SetupBackdrop>
      <section className="onboarding-window flex w-full max-w-2xl !min-h-0 flex-col p-5 sm:p-8 lg:p-10">
        <div className="flex items-center justify-between gap-4">
          <SetupBackButton onClick={onBack} />
          <span className="onboarding-step-chip">{translateOnboarding(locale, 'wizard.reconnection')}</span>
        </div>
        <div className="mt-8 max-w-xl sm:mt-10">
          <h1 className="text-[clamp(2rem,6vw,3.15rem)] font-semibold leading-none tracking-[-0.05em] text-[color:var(--ui-text-primary)]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)] sm:text-base">
            {description}
          </p>
        </div>
        <div className="mt-7 sm:mt-8">{children}</div>
      </section>
    </SetupBackdrop>
  );
}

export function SetupNotice({
  icon,
  title,
  children,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title?: string;
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <div className={clsx('onboarding-notice', `onboarding-notice-${tone}`)}>
      <span className="onboarding-notice-icon">{icon}</span>
      <div className="min-w-0">
        {title ? <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{title}</div> : null}
        <div className={clsx('text-sm leading-6 text-[color:var(--ui-text-secondary)]', title && 'mt-1')}>
          {children}
        </div>
      </div>
    </div>
  );
}
