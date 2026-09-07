import { useState } from 'react';
import clsx from 'clsx';
import { SlidersHorizontal, Search, X } from 'lucide-react';
import GlassDropdown, { type GlassDropdownOption } from './GlassDropdown';
import GlassBottomSheet from './GlassBottomSheet';
import { useI18n } from '../../i18n/I18nProvider';

export type GlassSearchFilterOption = GlassDropdownOption;

export type GlassSearchFilterDefinition = {
  id: string;
  label: string;
  ariaLabel?: string;
  options: GlassSearchFilterOption[];
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
};

type GlassSearchFilterBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  filters: GlassSearchFilterDefinition[];
  resultCount: number;
  onReset: () => void;
  placeholder?: string;
  resultLabel?: (count: number) => string;
  className?: string;
};

function selectedOption(filter: GlassSearchFilterDefinition) {
  return filter.options.find((option) => option.id === filter.value) ?? filter.options[0] ?? null;
}

function isFilterActive(filter: GlassSearchFilterDefinition) {
  return filter.value !== (filter.defaultValue ?? filter.options[0]?.id ?? '');
}

export function GlassSearchFilterBar({
  query,
  onQueryChange,
  filters,
  resultCount,
  onReset,
  placeholder,
  resultLabel,
  className,
}: GlassSearchFilterBarProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t('common.search');
  const resolvedResultLabel = resultLabel ?? ((count: number) => t('common.results', { count }));
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const activeFilters = filters.filter(isFilterActive);
  const hasFilters = filters.length > 0;
  const hasActiveCriteria = query.trim().length > 0 || activeFilters.length > 0;

  return (
    <>
      <div className={clsx('min-w-0', className)}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="liquid-glass-control flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5 md:min-h-11">
            <Search
              size={17}
              aria-hidden="true"
              className="shrink-0 text-[color:var(--ui-text-tertiary)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={resolvedPlaceholder}
              aria-label={resolvedPlaceholder}
              autoComplete="off"
              className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-[color:var(--ui-text-primary)] outline-none placeholder:text-[color:var(--ui-text-tertiary)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="glass-icon-button -mr-1 h-8 w-8 shrink-0"
                aria-label={t('common.clearSearch')}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className="liquid-glass-control relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[color:var(--ui-text-primary)] md:hidden"
              aria-label={
                activeFilters.length > 0
                  ? t('common.filtersActive', { count: activeFilters.length })
                  : t('common.openFilters')
              }
            >
              <SlidersHorizontal size={18} />
              {activeFilters.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-1 text-[10px] font-bold text-white shadow-sm">
                  {activeFilters.length}
                </span>
              ) : null}
            </button>
          ) : null}

          {hasFilters ? <div className="hidden min-w-0 flex-[1.5] items-center gap-2.5 md:flex">
            {filters.map((filter) => (
              <GlassDropdown
                key={filter.id}
                ariaLabel={filter.ariaLabel ?? filter.label}
                options={filter.options}
                selected={selectedOption(filter)}
                onChange={(option) => filter.onChange(option.id)}
                className="min-w-[8.5rem] flex-1"
              />
            ))}
            {hasActiveCriteria ? (
              <button
                type="button"
                onClick={onReset}
                className="liquid-glass-control min-h-11 shrink-0 rounded-2xl px-3.5 text-xs font-semibold text-[color:var(--ui-text-secondary)]"
              >
                {t('common.reset')}
              </button>
            ) : null}
          </div> : null}
        </div>

        <div className="mt-2.5 flex min-w-0 items-center gap-2 md:hidden">
          {activeFilters.length > 0 ? (
            <div className="glass-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              {activeFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() =>
                    filter.onChange(filter.defaultValue ?? filter.options[0]?.id ?? '')
                  }
                  className="liquid-glass-control inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]"
                  aria-label={t('common.removeFilter', { label: filter.label })}
                >
                  {selectedOption(filter)?.name ?? filter.label}
                  <X size={12} />
                </button>
              ))}
            </div>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <span
            aria-live="polite"
            className="shrink-0 text-[11px] font-semibold text-[color:var(--ui-text-tertiary)]"
          >
            {resolvedResultLabel(resultCount)}
          </span>
        </div>
      </div>

      {hasFilters ? <GlassBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={t('common.filters')}
        description={t('common.filtersDescription')}
        className="md:hidden"
        bodyClassName="space-y-4 !overflow-visible"
        footerClassName="!grid w-full grid-cols-[auto_minmax(0,1fr)]"
        footer={
          <>
            <button
              type="button"
              onClick={onReset}
              disabled={!hasActiveCriteria}
              className="liquid-glass-control min-h-12 rounded-2xl px-4 text-sm font-semibold text-[color:var(--ui-text-secondary)] disabled:opacity-40"
            >
              {t('common.reset')}
            </button>
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(false)}
              className="liquid-glass-selection min-h-12 min-w-0 rounded-2xl px-4 text-sm font-semibold"
            >
              {resolvedResultLabel(resultCount)}
            </button>
          </>
        }
      >
        {filters.map((filter) => (
          <GlassDropdown
            key={filter.id}
            label={filter.label}
            options={filter.options}
            selected={selectedOption(filter)}
            onChange={(option) => filter.onChange(option.id)}
            portalZIndex={280}
          />
        ))}
      </GlassBottomSheet> : null}
    </>
  );
}

export default GlassSearchFilterBar;
