import React, { useEffect, useMemo, useState } from 'react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { useI18n } from '../../i18n/I18nProvider';
import { italianTranslations, type TranslationKey } from '../../i18n/translations';
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

const defaultGreetingTranslator: GreetingTranslator = (key, parameters) => {
  const message = italianTranslations[key];
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

type GreetingCardProps = {
  state: DashboardStateShape;
  title?: string;
  subtitle?: string;
  titleAuto?: boolean;
  subtitleAuto?: boolean;
  compact?: boolean;
  clampTitle?: boolean;
};

export function GreetingCard({
  state,
  title,
  subtitle,
  titleAuto = true,
  subtitleAuto = true,
  compact = false,
  clampTitle = false,
}: GreetingCardProps) {
  const { t } = useI18n();
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
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), GREETING_REFRESH_MS);
    return () => window.clearInterval(timer);
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
  const isTinyCard = responsiveDensity === 'tiny';
  const isCompactCard = responsiveDensity === 'compact';
  const subtitleClass = isTinyCard
    ? 'text-[0.76rem] leading-[1.2] text-[color:var(--ui-text-secondary)]'
    : isCompactCard
      ? 'text-[0.84rem] leading-[1.24] text-[color:var(--ui-text-secondary)]'
      : 'text-[0.94rem] leading-[1.26] text-[color:var(--ui-text-secondary)]';
  const rowGapClass = isTinyCard ? 'gap-0.5' : isCompactCard ? 'gap-1.5' : 'gap-2.5';
  const titleClampLines = clampTitle
    ? subtitleLines.length > 0
      ? isTinyCard
        ? 1
        : 2
      : isTinyCard
        ? 2
        : 3
    : subtitleLines.length > 0
      ? isTinyCard
        ? 1
        : 2
      : 2;
  const subtitleClampLines = isTinyCard || isCompactCard ? 1 : 2;
  const subtitleLinesLimit = isTinyCard ? 1 : isCompactCard ? 2 : 3;
  const visibleSubtitleLines = subtitleLines.slice(0, subtitleLinesLimit);
  const hiddenSubtitleCount = Math.max(0, subtitleLines.length - visibleSubtitleLines.length);
  const compactSubtitle =
    hiddenSubtitleCount > 0
      ? `${visibleSubtitleLines.join(' | ')} | +${hiddenSubtitleCount}`
      : visibleSubtitleLines.join(' | ');
  const titleWrapStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: titleClampLines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
  const subtitleWrapStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: subtitleClampLines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
  const subtitleItemWrapClass = 'whitespace-normal break-words [overflow-wrap:anywhere]';

  return (
    <div
      ref={cardRef}
      className={`@container flex h-full w-full min-h-0 min-w-0 flex-col justify-center overflow-hidden ${rowGapClass}`}
    >
      {resolvedTitle ? (
        <h1
          className={`dashboard-page-title whitespace-normal break-words pb-[0.14em] pt-[0.03em] [overflow-wrap:anywhere] ${
            clampTitle ? 'overflow-hidden' : 'overflow-visible'
          }`}
          style={titleWrapStyle}
        >
          {resolvedTitle}
        </h1>
      ) : null}

      {subtitleLines.length ? (
        <div className={subtitleClass}>
          {isCompactCard || isTinyCard ? (
            <p className={`${subtitleItemWrapClass} text-[color:var(--ui-text-secondary)]`} style={subtitleWrapStyle}>
              {compactSubtitle}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {visibleSubtitleLines.slice(0, 2).map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className={`${subtitleItemWrapClass} ${
                    index === 1 ? 'text-[color:var(--ui-text-tertiary)]' : 'text-[color:var(--ui-text-secondary)]'
                  }`}
                  style={subtitleWrapStyle}
                >
                  {line}
                </p>
              ))}
              {hiddenSubtitleCount > 0 ? (
                <p className="text-[color:var(--ui-text-disabled)]">{`+${hiddenSubtitleCount}`}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
