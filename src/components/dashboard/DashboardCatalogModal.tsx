import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Blinds,
  Bot,
  Camera,
  CalendarDays,
  Check,
  CloudSun,
  Droplets,
  Fan,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  MoreHorizontal,
  Music2,
  Plus,
  Rows3,
  Shield,
  Sparkles,
  Thermometer,
  ToggleRight,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import type {
  DashboardSection,
  SectionKind,
  Widget,
  WidgetCatalogDestination,
  WidgetKind,
} from '../../types/dashboardModels';
import { SECTION_CATALOG, WIDGET_CATALOG } from '../../types/dashboardModels';
import GlassDropdown from '../ui/GlassDropdown';
import GlassModal from '../ui/GlassModal';
import GlassSearchFilterBar from '../ui/GlassSearchFilterBar';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';

type CatalogTab = 'cards' | 'sections';
type CatalogWidgetFamily = 'controls' | 'comfort' | 'security' | 'entertainment' | 'services';

const CATALOG_WIDGET_FAMILIES: CatalogWidgetFamily[] = [
  'controls',
  'comfort',
  'security',
  'entertainment',
  'services',
];

const CATALOG_FAMILY_KEYS: Record<CatalogWidgetFamily, TranslationKey> = {
  controls: 'home.catalog.family.controls',
  comfort: 'home.catalog.family.comfort',
  security: 'home.catalog.family.security',
  entertainment: 'home.catalog.family.entertainment',
  services: 'home.catalog.family.services',
};

const SECTION_LABEL_KEYS: Record<SectionKind, TranslationKey> = {
  greeting: 'home.catalog.section.greeting',
  weather: 'home.catalog.section.weather',
  scenes: 'home.catalog.section.scenes',
  'stack-vertical': 'home.catalog.section.verticalStack',
  'stack-horizontal': 'home.catalog.section.horizontalStack',
  'stack-grid': 'home.catalog.section.gridStack',
};

const WIDGET_LABEL_KEYS: Record<WidgetKind, TranslationKey> = {
  light: 'home.catalog.widget.light',
  switch: 'home.catalog.widget.switch',
  fan: 'home.catalog.widget.fan',
  humidifier: 'home.catalog.widget.humidifier',
  climate: 'home.catalog.widget.climate',
  camera: 'home.catalog.widget.camera',
  sensor: 'home.catalog.widget.sensor',
  media: 'home.catalog.widget.media',
  alarm: 'home.catalog.widget.alarm',
  vacuum: 'home.catalog.widget.vacuum',
  lock: 'home.catalog.widget.lock',
  cover: 'home.catalog.widget.cover',
  calendar: 'home.catalog.widget.calendar',
  members: 'home.catalog.widget.members',
};

const WIDGET_CATALOG_META: Record<
  WidgetKind,
  { descriptionKey: TranslationKey; family: CatalogWidgetFamily; icon: LucideIcon }
> = {
  light: { descriptionKey: 'home.catalog.description.light', family: 'controls', icon: Lightbulb },
  switch: { descriptionKey: 'home.catalog.description.switch', family: 'controls', icon: ToggleRight },
  fan: { descriptionKey: 'home.catalog.description.fan', family: 'controls', icon: Fan },
  humidifier: { descriptionKey: 'home.catalog.description.humidifier', family: 'comfort', icon: Droplets },
  cover: { descriptionKey: 'home.catalog.description.cover', family: 'controls', icon: Blinds },
  lock: { descriptionKey: 'home.catalog.description.lock', family: 'controls', icon: LockKeyhole },
  climate: { descriptionKey: 'home.catalog.description.climate', family: 'comfort', icon: Thermometer },
  sensor: { descriptionKey: 'home.catalog.description.sensor', family: 'comfort', icon: Activity },
  alarm: { descriptionKey: 'home.catalog.description.alarm', family: 'security', icon: Shield },
  camera: { descriptionKey: 'home.catalog.description.camera', family: 'security', icon: Camera },
  media: { descriptionKey: 'home.catalog.description.media', family: 'entertainment', icon: Music2 },
  vacuum: { descriptionKey: 'home.catalog.description.vacuum', family: 'services', icon: Bot },
  calendar: { descriptionKey: 'home.catalog.description.calendar', family: 'services', icon: CalendarDays },
  members: { descriptionKey: 'home.catalog.description.members', family: 'services', icon: Users },
};

const SECTION_CATALOG_META: Record<SectionKind, { descriptionKey: TranslationKey; icon: LucideIcon }> = {
  greeting: { descriptionKey: 'home.catalog.description.greeting', icon: Type },
  weather: { descriptionKey: 'home.catalog.description.weather', icon: CloudSun },
  scenes: { descriptionKey: 'home.catalog.description.scenes', icon: Sparkles },
  'stack-vertical': { descriptionKey: 'home.catalog.description.verticalStack', icon: Rows3 },
  'stack-horizontal': { descriptionKey: 'home.catalog.description.horizontalStack', icon: MoreHorizontal },
  'stack-grid': { descriptionKey: 'home.catalog.description.gridStack', icon: LayoutGrid },
};

const isStackSection = (section: DashboardSection) =>
  section.kind === 'stack-vertical' ||
  section.kind === 'stack-horizontal' ||
  section.kind === 'stack-grid';

type DashboardCatalogModalProps = {
  isOpen: boolean;
  onClose: () => void;
  sections: DashboardSection[];
  widgets: Widget[];
  selectedSectionId: string | null;
  onAddWidget: (kind: WidgetKind, destination: WidgetCatalogDestination) => string;
  onAddSection: (kind: SectionKind) => string;
};

export function DashboardCatalogModal({
  isOpen,
  onClose,
  sections,
  widgets,
  selectedSectionId,
  onAddWidget,
  onAddSection,
}: DashboardCatalogModalProps) {
  const { t } = useI18n();
  const sectionLabel = useCallback((kind: SectionKind) => t(SECTION_LABEL_KEYS[kind]), [t]);
  const widgetLabel = useCallback((kind: WidgetKind) => t(WIDGET_LABEL_KEYS[kind]), [t]);
  const selectedStack = selectedSectionId
    ? sections.find((section) => section.id === selectedSectionId && isStackSection(section))
    : undefined;
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('cards');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogDestination, setCatalogDestination] = useState<WidgetCatalogDestination>(
    selectedStack ? { type: 'stack', sectionId: selectedStack.id } : { type: 'canvas' },
  );
  const [selectedCatalogWidgetKind, setSelectedCatalogWidgetKind] = useState<WidgetKind | null>(null);
  const [selectedCatalogSectionKind, setSelectedCatalogSectionKind] = useState<SectionKind | null>(null);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (
      catalogDestination.type === 'stack' &&
      !sections.some(
        (section) => section.id === catalogDestination.sectionId && isStackSection(section),
      )
    ) {
      setCatalogDestination({ type: 'canvas' });
    }
  }, [catalogDestination, sections]);

  const stackSections = useMemo(() => sections.filter(isStackSection), [sections]);
  const catalogDestinationOptions = useMemo(
    () => [
      { id: 'canvas', name: t('home.catalog.mainDashboard') },
      ...stackSections.map((section) => {
        const cardsCount = widgets.filter((widget) => widget.parentSectionId === section.id).length;
        const sectionName = section.title?.trim() || sectionLabel(section.kind);
        return {
          id: section.id,
          name: `${sectionName} · ${cardsCount} card`,
        };
      }),
    ],
    [sectionLabel, stackSections, t, widgets],
  );
  const selectedCatalogDestinationOption = useMemo(() => {
    const destinationId =
      catalogDestination.type === 'stack' ? catalogDestination.sectionId : 'canvas';
    return (
      catalogDestinationOptions.find((option) => option.id === destinationId) ??
      catalogDestinationOptions[0] ??
      null
    );
  }, [catalogDestination, catalogDestinationOptions]);
  const normalizedCatalogQuery = catalogQuery.trim().toLocaleLowerCase('it');
  const filteredWidgetCatalog = useMemo(
    () =>
      WIDGET_CATALOG.filter((item) => {
        if (!normalizedCatalogQuery) return true;
        const meta = WIDGET_CATALOG_META[item.kind];
        return `${widgetLabel(item.kind)} ${t(meta.descriptionKey)} ${t(
          CATALOG_FAMILY_KEYS[meta.family],
        )}`
          .toLocaleLowerCase()
          .includes(normalizedCatalogQuery);
      }),
    [normalizedCatalogQuery, t, widgetLabel],
  );
  const filteredSectionCatalog = useMemo(
    () =>
      SECTION_CATALOG.filter((item) => {
        if (!normalizedCatalogQuery) return true;
        const meta = SECTION_CATALOG_META[item.kind];
        return `${sectionLabel(item.kind)} ${t(meta.descriptionKey)}`
          .toLocaleLowerCase()
          .includes(normalizedCatalogQuery);
      }),
    [normalizedCatalogQuery, sectionLabel, t],
  );
  const selectedCatalogDestinationName =
    selectedCatalogDestinationOption?.name ?? t('home.catalog.mainDashboard');
  const selectedCatalogItemLabel =
    catalogTab === 'cards'
      ? selectedCatalogWidgetKind
        ? widgetLabel(selectedCatalogWidgetKind)
        : undefined
      : selectedCatalogSectionKind
        ? sectionLabel(selectedCatalogSectionKind)
        : undefined;
  const canConfirmCatalogSelection =
    catalogTab === 'cards'
      ? Boolean(selectedCatalogWidgetKind)
      : Boolean(selectedCatalogSectionKind);
  const catalogConfirmLabel =
    catalogTab === 'sections'
      ? t('home.catalog.createSection')
      : catalogDestination.type === 'stack'
        ? t('home.catalog.addTo', {
            destination:
              selectedCatalogDestinationOption?.name.split(' · ')[0] ?? 'stack',
          })
        : t('home.catalog.addToCanvas');

  const confirmCatalogSelection = useCallback(() => {
    if (catalogTab === 'cards') {
      if (!selectedCatalogWidgetKind) return;
      onAddWidget(selectedCatalogWidgetKind, catalogDestination);
      setCatalogFeedback(
        t('home.catalog.cardAdded', {
          item: widgetLabel(selectedCatalogWidgetKind) || t('home.catalog.fallbackCard'),
          destination: selectedCatalogDestinationName,
        }),
      );
      setSelectedCatalogWidgetKind(null);
      return;
    }

    if (!selectedCatalogSectionKind) return;
    onAddSection(selectedCatalogSectionKind);
    setCatalogFeedback(
      t('home.catalog.sectionCreated', {
        item:
          sectionLabel(selectedCatalogSectionKind) || t('home.catalog.fallbackSection'),
      }),
    );
    setSelectedCatalogSectionKind(null);
  }, [
    catalogDestination,
    catalogTab,
    onAddSection,
    onAddWidget,
    sectionLabel,
    selectedCatalogDestinationName,
    selectedCatalogSectionKind,
    selectedCatalogWidgetKind,
    t,
    widgetLabel,
  ]);

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={t('home.catalog.eyebrow')}
      title={t('home.catalog.title')}
      description={t('home.catalog.description')}
      variant="responsive"
      size="xl"
      zIndex={120}
      closeLabel={t('home.catalog.closeAria')}
      backdropClassName="!bg-[color:var(--ui-scrim)] !backdrop-blur-3xl"
      bodyClassName="space-y-5 pb-1"
      footerClassName="border-t border-[color:var(--ui-separator)]"
      footer={
        <>
          <div className="mr-auto hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-[color:var(--ui-text-secondary)]">
              {selectedCatalogItemLabel
                ? t('home.catalog.selected', { item: selectedCatalogItemLabel })
                : t('home.catalog.selectItem')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-tour-target="catalog-finish"
            className="liquid-glass-control h-11 rounded-2xl px-5 text-sm font-semibold text-[color:var(--ui-text-secondary)] transition hover:brightness-110 hover:text-[color:var(--ui-text-primary)]"
          >
            {t('home.catalog.done')}
          </button>
          <button
            type="button"
            onClick={confirmCatalogSelection}
            disabled={!canConfirmCatalogSelection}
            data-tour-target="catalog-confirm"
            className="liquid-glass-selection h-11 min-w-0 flex-1 rounded-2xl px-5 text-sm font-semibold shadow-[0_8px_24px_var(--ui-shadow-soft)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
          >
            <span className="block max-w-[15rem] truncate">{catalogConfirmLabel}</span>
          </button>
        </>
      }
    >
      <section
        className="liquid-glass-card rounded-[1.5rem] p-4 sm:p-5"
        aria-labelledby="catalog-destination-title"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              id="catalog-destination-title"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]"
            >
              {t('home.catalog.destination')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ui-text-secondary)]">
              {catalogTab === 'cards'
                ? t('home.catalog.destinationCardDescription')
                : t('home.catalog.destinationSectionDescription')}
            </p>
          </div>
        </div>
        <GlassDropdown
          options={catalogDestinationOptions}
          selected={
            catalogTab === 'sections'
              ? catalogDestinationOptions[0] ?? null
              : selectedCatalogDestinationOption
          }
          onChange={(option) => {
            setCatalogDestination(
              option.id === 'canvas'
                ? { type: 'canvas' }
                : { type: 'stack', sectionId: option.id },
            );
            setCatalogFeedback(null);
          }}
          ariaLabel={t('home.catalog.destinationAria')}
          disabled={catalogTab === 'sections'}
        />
      </section>

      <div className="space-y-3">
        <GlassSegmentSelect<CatalogTab>
          value={catalogTab}
          onChange={(nextTab) => {
            setCatalogTab(nextTab);
            setCatalogFeedback(null);
          }}
          options={[
            { value: 'cards', label: t('home.catalog.cards') },
            { value: 'sections', label: t('home.catalog.sections') },
          ]}
          ariaLabel={t('home.catalog.componentTypeAria')}
          className="w-full"
        />

        <GlassSearchFilterBar
          query={catalogQuery}
          onQueryChange={setCatalogQuery}
          filters={[]}
          resultCount={
            catalogTab === 'cards'
              ? filteredWidgetCatalog.length
              : filteredSectionCatalog.length
          }
          onReset={() => setCatalogQuery('')}
          placeholder={
            catalogTab === 'cards'
              ? t('home.catalog.searchCard')
              : t('home.catalog.searchSection')
          }
          resultLabel={(count) =>
            t(count === 1 ? 'home.catalog.resultOne' : 'home.catalog.resultMany', { count })
          }
        />
      </div>

      <div className="space-y-5" aria-live="polite">
        {catalogTab === 'cards' ? (
          CATALOG_WIDGET_FAMILIES.map((family) => {
            const familyItems = filteredWidgetCatalog.filter(
              (item) => WIDGET_CATALOG_META[item.kind].family === family,
            );
            if (familyItems.length === 0) return null;
            return (
              <section key={family} aria-labelledby={`catalog-family-${family}`}>
                <h3
                  id={`catalog-family-${family}`}
                  className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]"
                >
                  {t(CATALOG_FAMILY_KEYS[family])}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {familyItems.map((item) => {
                    const meta = WIDGET_CATALOG_META[item.kind];
                    const Icon = meta.icon;
                    const isSelected = selectedCatalogWidgetKind === item.kind;
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        data-tour-target={item.kind === 'light' ? 'catalog-light' : undefined}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedCatalogWidgetKind(item.kind);
                          setCatalogFeedback(null);
                        }}
                        className={`btn-premium flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_var(--ui-border),0_8px_22px_var(--ui-shadow-soft)]'
                            : 'liquid-glass-card hover:bg-[color:var(--ui-surface-glass-strong)]'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                            isSelected
                              ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:var(--ui-accent)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                          }`}
                        >
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                            {widgetLabel(item.kind)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">
                            {t(meta.descriptionKey)}
                          </span>
                        </span>
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            isSelected
                              ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-tertiary)]'
                          }`}
                        >
                          {isSelected ? (
                            <Check size={14} aria-hidden="true" />
                          ) : (
                            <Plus size={14} aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <section aria-labelledby="catalog-sections-title">
            <h3
              id="catalog-sections-title"
              className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]"
            >
              {t('home.catalog.structure')}
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredSectionCatalog.map((item) => {
                const meta = SECTION_CATALOG_META[item.kind];
                const Icon = meta.icon;
                const isSelected = selectedCatalogSectionKind === item.kind;
                return (
                  <button
                    key={item.kind}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedCatalogSectionKind(item.kind);
                      setCatalogFeedback(null);
                    }}
                    className={`btn-premium flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_var(--ui-border),0_8px_22px_var(--ui-shadow-soft)]'
                        : 'liquid-glass-card hover:bg-[color:var(--ui-surface-glass-strong)]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] text-[color:var(--ui-accent)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                        {sectionLabel(item.kind)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">
                        {t(meta.descriptionKey)}
                      </span>
                    </span>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-[color:rgb(var(--ui-accent-rgb)/0.36)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:var(--ui-accent)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-tertiary)]'
                      }`}
                    >
                      {isSelected ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Plus size={14} aria-hidden="true" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {(catalogTab === 'cards'
          ? filteredWidgetCatalog.length
          : filteredSectionCatalog.length) === 0 ? (
          <div className="liquid-glass-card rounded-2xl px-4 py-8 text-center">
            <p className="text-sm font-medium text-[color:var(--ui-text-primary)]">
              {t('home.catalog.noResults')}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
              {t('home.catalog.noResultsDescription')}
            </p>
          </div>
        ) : null}

        {catalogFeedback ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--ui-success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-success)_12%,transparent)] px-3.5 py-3 text-xs font-medium text-[color:var(--ui-success)]"
          >
            <Check size={15} aria-hidden="true" />
            <span className="min-w-0 truncate">{catalogFeedback}</span>
          </div>
        ) : null}
      </div>
    </GlassModal>
  );
}

export default DashboardCatalogModal;
