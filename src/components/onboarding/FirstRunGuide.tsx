import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import '../devices/theme/tokens.css';
import './firstRunGuide.css';

/*
 * The first look at the Home after setup: three short steps in a sheet at the
 * bottom, with dots, "Skip" and "Next / Start". It does not point at anything
 * on the page: it says what the Home is, where to change it and where Rooms
 * are. The Demo has its own words and a way to connect the real home.
 */

export type FirstRunGuideVariant = 'recommended' | 'empty' | 'demo';

const STEPS: Record<FirstRunGuideVariant, Array<[TranslationKey, TranslationKey]>> = {
  recommended: [
    ['home.firstRun.ready.title', 'home.firstRun.ready.description'],
    ['home.firstRun.edit.title', 'home.firstRun.edit.description'],
    ['home.firstRun.rooms.title', 'home.firstRun.rooms.description'],
  ],
  empty: [
    ['home.firstRun.empty.title', 'home.firstRun.empty.description'],
    ['home.firstRun.edit.title', 'home.firstRun.edit.description'],
    ['home.firstRun.rooms.title', 'home.firstRun.rooms.description'],
  ],
  demo: [
    ['home.firstRun.demo.title', 'home.firstRun.demo.description'],
    ['home.firstRun.demoRooms.title', 'home.firstRun.demoRooms.description'],
    ['home.firstRun.demoConnect.title', 'home.firstRun.demoConnect.description'],
  ],
};

export function FirstRunGuide({
  variant,
  onFinish,
  onConnect,
}: {
  variant: FirstRunGuideVariant;
  /** Skipped or done: either way it does not come back. */
  onFinish: () => void;
  /** In the Demo: connect the real home. */
  onConnect?: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const titleRef = useRef<HTMLElement>(null);
  const steps = STEPS[variant];
  const [title, description] = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [index]);

  return (
    <div
      className="frg-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="frg-title"
      aria-describedby="frg-text"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onFinish();
      }}
    >
      <div className="frg-top">
        <span className={clsx('frg-tag', variant === 'demo' && 'is-demo')}>
          {variant === 'demo' ? t('home.firstRun.demoTag') : t('home.firstRun.tag')}
        </span>
        <span className="frg-dots" aria-label={t('home.firstRun.step', { current: index + 1, total: steps.length })} role="img">
          {steps.map(([key], dot) => <i key={key} className={dot === index ? 'is-on' : undefined} />)}
        </span>
      </div>
      <b id="frg-title" ref={titleRef} tabIndex={-1} className="frg-title">{t(title)}</b>
      <span id="frg-text" className="frg-text">{t(description)}</span>
      <div className="frg-actions">
        {last ? null : (
          <button type="button" className="frg-btn is-ghost" onClick={onFinish}>
            {t('home.firstRun.skip')}
          </button>
        )}
        {variant === 'demo' && last && onConnect ? (
          <button type="button" className="frg-btn is-soft" onClick={onConnect}>
            {t('home.firstRun.connect')}
          </button>
        ) : null}
        <button
          type="button"
          className="frg-btn is-main"
          onClick={() => (last ? onFinish() : setIndex((current) => current + 1))}
        >
          {last ? t('home.firstRun.start') : t('home.firstRun.next')}
        </button>
      </div>
    </div>
  );
}

export default FirstRunGuide;
