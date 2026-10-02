import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';

export type NestedPageHeaderProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  backAriaLabel?: string;
  onBack: () => void;
  trailing?: ReactNode;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  maxWidthClassName?: string;
  contentClassName?: string;
  className?: string;
  focusOnMount?: boolean;
  /** Light text over a full-bleed mobile hero until the glass background appears. */
  overlay?: boolean;
};

export function NestedPageHeader({
  title,
  subtitle,
  backLabel = 'Indietro',
  backAriaLabel = 'Indietro',
  onBack,
  trailing,
  scrollContainerRef,
  maxWidthClassName = 'max-w-none',
  contentClassName,
  className,
  focusOnMount = true,
  overlay = false,
}: NestedPageHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [glassProgress, setGlassProgress] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollContainerRef?.current ?? headerRef.current?.parentElement;
    if (!scrollContainer) {
      return;
    }

    const updateProgress = () => {
      const nextProgress = Math.min(1, Math.max(0, scrollContainer.scrollTop / 48));
      setGlassProgress((current) =>
        Math.abs(current - nextProgress) < 0.005 ? current : nextProgress,
      );
    };

    updateProgress();
    scrollContainer.addEventListener('scroll', updateProgress, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateProgress);
  }, [scrollContainerRef]);

  useEffect(() => {
    if (!focusOnMount) {
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [focusOnMount, title]);

  const onImage = overlay && glassProgress < 0.6;

  return (
    <header
      ref={headerRef}
      data-testid="nested-page-header"
      data-glass-progress={glassProgress.toFixed(2)}
      className={clsx('sticky top-0 z-40 w-full', className)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 border-b border-[color:var(--ui-separator)] bg-[color:var(--ui-bg-grouped)] shadow-[0_10px_30px_var(--ui-shadow-soft)] backdrop-blur-3xl"
        style={{ opacity: glassProgress }}
      />
      <div
        className={clsx(
          'relative mx-auto flex min-h-[calc(env(safe-area-inset-top)+4.65rem)] w-full items-center gap-3 px-4 pt-[env(safe-area-inset-top)] sm:min-h-[4.65rem] sm:px-6 sm:pt-0 lg:px-8',
          maxWidthClassName,
          contentClassName,
        )}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={backAriaLabel}
          className={clsx(
            'liquid-glass-control flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full px-0 text-sm font-semibold text-[color:var(--ui-text-primary)] transition-transform active:scale-[0.96] sm:w-auto sm:px-3',
            onImage && 'max-md:!border-white/25 max-md:!bg-black/20 max-md:!text-white',
          )}
        >
          <ArrowLeft size={17} />
          <span className="hidden sm:inline">{backLabel}</span>
        </button>

        <div className={clsx('min-w-0 flex-1', onImage && 'max-md:[&_*]:!text-white')}>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="truncate text-[1.05rem] font-semibold tracking-[-0.025em] text-[color:var(--ui-text-primary)] outline-none sm:text-xl"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] leading-4 text-[color:var(--ui-text-secondary)] sm:text-xs">
              {subtitle}
            </p>
          ) : null}
        </div>

        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </header>
  );
}

export default NestedPageHeader;
