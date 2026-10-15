import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import { useCardSize } from './useCardSize';

export type GreetingDefaults = {
  title: string;
  subtitle: string;
  greeting: string;
  name: string;
};

export type GreetingResponsiveDensity = 'tiny' | 'compact' | 'regular';

const GREETING_REFRESH_MS = 60000;

type GreetingTranslator = (key: TranslationKey, parameters?: Record<string, string | number>) => string;

const DEFAULT_GREETING_MESSAGES: Partial<Record<TranslationKey, string>> = {
  'greeting.morning': 'Buongiorno',
  'greeting.afternoon': 'Buon pomeriggio',
  'greeting.evening': 'Buonasera',
  'greeting.night': 'Buonanotte',
  'greeting.welcomeBack': 'Bentornato',
  'greeting.weekend': 'Buon weekend',
  'greeting.home.quiet': 'Casa in quiete.',
  'greeting.home.favorite.one': 'Casa pronta. Un preferito è attivo.',
  'greeting.home.favorite.many': 'Casa pronta. {count} preferiti attivi.',
  'greeting.home.function.one': 'Una funzione principale è attiva.',
  'greeting.home.function.many': '{count} funzioni principali attive.',
  'greeting.home.calm': 'Tutto tranquillo. Nessuna attività rilevante.',
  'greeting.home.lightTimer': 'Timer luce attivo per altri {minutes} min.',
};

const defaultGreetingTranslator: GreetingTranslator = (key, parameters) => {
  const message = DEFAULT_GREETING_MESSAGES[key] ?? key;
  if (!parameters) return message;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, parameter: string) =>
    Object.prototype.hasOwnProperty.call(parameters, parameter) ? String(parameters[parameter]) : match,
  );
};

function resolveTimeGreetingLabel(now: Date, t: GreetingTranslator) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return t('greeting.morning');
  if (hour >= 11 && hour < 17) return t('greeting.afternoon');
  if (hour >= 17 && hour < 22) return t('greeting.evening');
  return t('greeting.welcomeBack');
}

function isWeekend(now: Date) {
  const day = now.getDay();
  return day === 0 || day === 6;
}

function resolveGreetingLabel(state: DashboardStateShape, now: Date, t: GreetingTranslator) {
  const baseGreeting = resolveTimeGreetingLabel(now, t);
  const hour = now.getHours();
  if (hour >= 22 || hour < 5) return t('greeting.night');
  if (state.livingRoomMasterOff) return t('greeting.welcomeBack');
  if (isWeekend(now) && (baseGreeting === t('greeting.morning') || baseGreeting === t('greeting.afternoon'))) {
    return t('greeting.weekend');
  }
  return baseGreeting;
}

function buildHomeSummary(state: DashboardStateShape, now: Date, t: GreetingTranslator) {
  const lines: string[] = [];
  const activeFavorites = state.favorites.filter((device) => device.isOn).length;
  const activePrimaryFunctions = [
    state.lamp.isOn,
    state.climate.isOn,
    state.speaker.isPlaying,
  ].filter(Boolean).length;
  const isHouseQuiet =
    state.livingRoomMasterOff &&
    !state.speaker.isPlaying &&
    activeFavorites === 0;

  if (isHouseQuiet) {
    lines.push(t('greeting.home.quiet'));
  } else if (activeFavorites > 0) {
    lines.push(
      activeFavorites === 1
        ? t('greeting.home.favorite.one')
        : t('greeting.home.favorite.many', { count: activeFavorites }),
    );
  } else if (activePrimaryFunctions > 0) {
    lines.push(
      activePrimaryFunctions === 1
        ? t('greeting.home.function.one')
        : t('greeting.home.function.many', { count: activePrimaryFunctions }),
    );
  } else {
    lines.push(t('greeting.home.calm'));
  }

  if (state.lamp.activeTimerEnd) {
    const remainingMs = Math.max(0, state.lamp.activeTimerEnd - now.getTime());
    const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));
    lines.push(t('greeting.home.lightTimer', { minutes: remainingMinutes }));
  }

  return lines.slice(0, 2);
}

export function getGreetingDefaults(
  state: DashboardStateShape,
  now = new Date(),
  t: GreetingTranslator = defaultGreetingTranslator,
): GreetingDefaults {
  const greeting = resolveGreetingLabel(state, now, t);
  const name = state.userName.trim();
  return {
    title: name ? `${greeting}, ${name}!` : `${greeting}!`,
    subtitle: buildHomeSummary(state, now, t).join('\n'),
    greeting,
    name,
  };
}

export function resolveGreetingResponsiveDensity({
  width,
  height,
  hasSize,
  compact,
}: {
  width: number;
  height: number;
  hasSize: boolean;
  compact: boolean;
}): GreetingResponsiveDensity {
  if (hasSize && (width <= 340 || height <= 104)) {
    return 'tiny';
  }
  if (compact || (hasSize && (width <= 720 || height <= 172))) {
    return 'compact';
  }
  return 'regular';
}

export const GREETING_TITLE_MIN_SIZE = 24;
export const GREETING_TITLE_MAX_SIZE = 48;
const GREETING_TITLE_LINE_HEIGHT = 1.08;
// Below this size a name moves to its own line rather than shrink the greeting further.
const GREETING_TITLE_SPLIT_SIZE = 26;

/**
 * The title size that fits the card: the widest line fills the width, capped
 * by the height left after the date and the subtitle. A long title with a name
 * splits into "greeting," and "name!" rather than cut the greeting.
 * `measure` gives a text's width at 100 px.
 */
export function fitGreetingTitle({
  width,
  height,
  title,
  splitLines,
  reservedHeight,
  measure,
}: {
  width: number;
  height: number;
  title: string;
  splitLines?: [string, string];
  reservedHeight: number;
  measure: (text: string) => number;
}) {
  const sizeFor = (lines: string[]) => {
    const widest = Math.max(...lines.map(measure));
    const byWidth = widest > 0 && width > 0 ? (width / widest) * 100 : GREETING_TITLE_MAX_SIZE;
    const byHeight = height > 0
      ? (height - reservedHeight) / (lines.length * GREETING_TITLE_LINE_HEIGHT)
      : GREETING_TITLE_MAX_SIZE;
    return Math.min(GREETING_TITLE_MAX_SIZE, byWidth, byHeight);
  };
  const single = sizeFor([title]);
  if (single >= GREETING_TITLE_SPLIT_SIZE || !splitLines) {
    return { lines: [title], size: Math.max(GREETING_TITLE_MIN_SIZE, Math.floor(single)) };
  }
  const split = sizeFor(splitLines);
  return split > single
    ? { lines: [...splitLines], size: Math.max(GREETING_TITLE_MIN_SIZE, Math.floor(split)) }
    : { lines: [title], size: GREETING_TITLE_MIN_SIZE };
}

let titleMeasureCanvas: HTMLCanvasElement | null = null;

/** Measures the bold title at 100 px with the card's font; an estimate where canvas is missing. */
function createTitleMeasure(fontFamily: string) {
  let context: CanvasRenderingContext2D | null = null;
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  if (fontFamily && !isJsdom && typeof document !== 'undefined') {
    try {
      titleMeasureCanvas ??= document.createElement('canvas');
      context = titleMeasureCanvas.getContext('2d');
    } catch {
      context = null;
    }
  }
  return (text: string) => {
    if (!context) return text.length * 54;
    context.font = `700 100px ${fontFamily}`;
    // The title is set with -0.02em of tracking.
    return Math.max(0, context.measureText(text).width - text.length * 2);
  };
}

type GreetingCardProps = {
  state: DashboardStateShape;
  title?: string;
  subtitle?: string;
  titleAuto?: boolean;
  subtitleAuto?: boolean;
  compact?: boolean;
  /** A small date line above the title. */
  showDate?: boolean;
};

export function GreetingCard({
  state,
  title,
  subtitle,
  titleAuto = true,
  subtitleAuto = true,
  compact = false,
  showDate = false,
}: GreetingCardProps) {
  const { locale, t } = useI18n();
  const {
    ref: cardRef,
    width: cardWidth,
    height: cardHeight,
    hasSize: hasCardSize,
  } = useCardSize({
    tinyWidth: 330,
    tinyHeight: 95,
    compactWidth: 640,
    compactHeight: 165,
  });
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [titleFontFamily, setTitleFontFamily] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), GREETING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (titleRef.current) setTitleFontFamily(getComputedStyle(titleRef.current).fontFamily);
  }, []);

  const now = useMemo(() => new Date(clock), [clock]);
  const defaults = useMemo(() => getGreetingDefaults(state, now, t), [state, now, t]);
  const resolvedTitle = (!titleAuto ? title ?? '' : defaults.title)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const resolvedSubtitle = !subtitleAuto ? subtitle ?? '' : defaults.subtitle;
  const subtitleLines = resolvedSubtitle.split('\n').filter((line) => line.length > 0);
  const responsiveDensity = resolveGreetingResponsiveDensity({
    width: cardWidth,
    height: cardHeight,
    hasSize: hasCardSize,
    compact,
  });
  const isNarrowCard = hasCardSize ? cardWidth < 420 : compact;
  const subtitleSize = isNarrowCard ? 14 : 15;
  // Two subtitle lines only where the card is tall enough.
  const subtitleLineCount = responsiveDensity === 'regular' ? 2 : 1;
  const visibleSubtitle = subtitleLines.length > subtitleLineCount
    ? [...subtitleLines.slice(0, subtitleLineCount - 1), subtitleLines.slice(subtitleLineCount - 1).join(' · ')]
    : subtitleLines;
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now),
    [locale, now],
  );

  const measure = useMemo(() => createTitleMeasure(titleFontFamily), [titleFontFamily]);
  const reservedHeight =
    (showDate ? 18 : 0) + visibleSubtitle.length * Math.ceil(subtitleSize * 1.3 + 2) + 8;
  const fitted = hasCardSize
    ? fitGreetingTitle({
        width: cardWidth * 0.98,
        height: cardHeight,
        title: resolvedTitle,
        splitLines: titleAuto && defaults.name ? [`${defaults.greeting},`, `${defaults.name}!`] : undefined,
        reservedHeight,
        measure,
      })
    : null;
  const titleLines = fitted?.lines ?? [resolvedTitle];

  return (
    // On a phone the greeting sits on the bottom of its row, next to the card
    // below, leaving the spare height under the top bar like a large title.
    <div
      ref={cardRef}
      className="@container flex h-full w-full min-h-0 min-w-0 flex-col justify-end gap-1 overflow-hidden md:justify-center"
    >
      {showDate ? (
        <p
          className={`truncate font-semibold uppercase tracking-[0.06em] text-[color:var(--ui-text-secondary)] ${
            isNarrowCard ? 'text-[11px]' : 'text-xs'
          }`}
        >
          {dateLabel}
        </p>
      ) : null}

      {resolvedTitle ? (
        <h1
          ref={titleRef}
          className="dashboard-page-title min-w-0 tracking-[-0.02em]"
          style={fitted ? { fontSize: `${fitted.size}px`, lineHeight: GREETING_TITLE_LINE_HEIGHT } : undefined}
        >
          {titleLines.map((line, index) => (
            // The padding keeps the descenders (g, p) inside the truncation box.
            <span key={`${line}-${index}`} className="-mb-[0.12em] block truncate pb-[0.12em]">
              {line}
            </span>
          ))}
        </h1>
      ) : null}

      {visibleSubtitle.length ? (
        <div className="mt-0.5 flex min-w-0 flex-col" style={{ fontSize: `${subtitleSize}px`, lineHeight: 1.3 }}>
          {visibleSubtitle.map((line, index) => (
            <p
              key={`${line}-${index}`}
              className={`truncate font-medium ${
                index === 1 ? 'text-[color:var(--ui-text-tertiary)]' : 'text-[color:var(--ui-text-secondary)]'
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
