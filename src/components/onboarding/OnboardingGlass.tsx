import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import { GlassButton } from '../ui/GlassButton';
import { useDeviceAppearance } from './deviceAppearance';

// The appearance hook lives on its own so startup does not load these screens.
export { useDeviceAppearance } from './deviceAppearance';

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

export function WizardActions({ children }: { children: ReactNode }) {
  return (
    <div className="onboarding-actions mt-7 flex flex-col-reverse gap-2 border-t border-[color:var(--ui-border)] pt-5 sm:flex-row sm:justify-end">
      {children}
    </div>
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
