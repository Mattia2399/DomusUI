import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Widget } from '../../types/dashboardModels';
import {
  resolveCardDensityByBreakpoint,
  type GridEngineBreakpoint,
} from '../dashboard/dashboardBreakpointConfig';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';

type HouseMemberCardItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
};

type MembersCardProps = {
  widget: Widget;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
  onOpenMembersPanel?: () => void;
  houseMembers?: HouseMemberCardItem[];
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant?: WidgetDisplayVariant;
};

function initialsFromName(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export function MembersCard({
  widget,
  isSelected,
  isEditMode,
  onClick,
  onOpenMembersPanel,
  houseMembers = [],
  gridBreakpoint,
  displayVariant,
}: MembersCardProps) {
  const { t, locale } = useI18n();
  const canOpenMembersPanel = !isEditMode && typeof onOpenMembersPanel === 'function';
  const cardDensity = resolveCardDensityByBreakpoint(gridBreakpoint);
  const isTinyCard = cardDensity === 'tiny' || cardDensity === 'compact';
  const cardRadiusClass = isTinyCard ? 'rounded-[1.45rem]' : 'rounded-[1.6rem]';
  const sortedMembers = [...houseMembers].sort((first, second) => {
    if (first.isCurrent === true && second.isCurrent !== true) {
      return -1;
    }
    if (second.isCurrent === true && first.isCurrent !== true) {
      return 1;
    }
    return first.name.localeCompare(second.name, locale);
  });
  const visibleMembers = sortedMembers.slice(0, 4);
  const hiddenMembersCount = Math.max(0, sortedMembers.length - visibleMembers.length);
  const titleLabel = widget.title?.trim() || t('home.members.title');

  return (
    <div
      data-card-variant={displayVariant}
      className={`relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden ${cardRadiusClass} ${
        isSelected ? 'selection-corners' : ''
      }`}
    >
      <div
        className={`liquid-glass-card relative h-full w-full min-h-0 min-w-0 overflow-hidden ${cardRadiusClass} ${
          isTinyCard ? 'px-3 py-2.5' : 'px-4 py-3.5'
        }`}
      >
        <div className="relative flex h-full min-h-0 flex-col justify-between">
          <div className="flex items-center justify-between gap-3">
            <p className={`min-w-0 truncate font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)] ${isTinyCard ? 'text-[0.92rem]' : 'text-base'}`}>
              {titleLabel}
            </p>
            <button
              type="button"
              data-members-panel-trigger="true"
              aria-disabled={!canOpenMembersPanel}
              onClick={(event) => {
                event.stopPropagation();
                if (!canOpenMembersPanel) {
                  return;
                }
                onOpenMembersPanel();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
              className={`pointer-events-auto relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] transition-colors ${
                canOpenMembersPanel
                  ? 'btn-premium hover:bg-[color:var(--ui-fill-secondary)]'
                  : 'cursor-default opacity-60'
              }`}
              aria-label={t('home.members.open')}
              title={t('home.members.open')}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {visibleMembers.length > 0 ? (
            <div className="mt-3 flex items-center">
              {visibleMembers.map((member, index) => (
                <div
                  key={member.id}
                  className={`relative ${index === 0 ? '' : '-ml-2'}`}
                  title={member.name}
                >
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={t('home.members.avatar', { name: member.name })}
                      className={`${isTinyCard ? 'h-8 w-8' : 'h-9 w-9'} rounded-full border-2 border-[color:var(--ui-surface-glass-strong)] object-cover`}
                    />
                  ) : (
                    <span
                      className={`flex ${isTinyCard ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-[11px]'} items-center justify-center rounded-full border-2 border-[color:var(--ui-surface-glass-strong)] bg-[color:var(--ui-fill-secondary)] font-semibold text-[color:var(--ui-text-primary)] shadow-lg backdrop-blur-xl`}
                    >
                      {initialsFromName(member.name)}
                    </span>
                  )}
                  {member.isCurrent ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[color:var(--ui-surface-glass-strong)] bg-emerald-400" />
                  ) : null}
                </div>
              ))}
              {hiddenMembersCount > 0 ? (
                <span
                  className={`-ml-2 flex ${isTinyCard ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-[11px]'} items-center justify-center rounded-full border-2 border-[color:var(--ui-surface-glass-strong)] bg-[color:var(--ui-fill-secondary)] font-semibold text-[color:var(--ui-text-primary)] shadow-lg backdrop-blur-xl`}
                >
                  +{hiddenMembersCount}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[color:var(--ui-text-secondary)]">{t('home.members.empty')}</p>
          )}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          const clickTarget = event.target;
          if (
            clickTarget instanceof Element &&
            clickTarget.closest('[data-members-panel-trigger="true"]')
          ) {
            return;
          }
          event.stopPropagation();
          onClick();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }
        }}
        className={`absolute inset-0 z-10 ${cardRadiusClass} widget-card-handle ${isEditMode ? 'cursor-grab' : 'cursor-pointer'}`}
        aria-label={t('home.card.open', { name: titleLabel })}
      />
    </div>
  );
}
