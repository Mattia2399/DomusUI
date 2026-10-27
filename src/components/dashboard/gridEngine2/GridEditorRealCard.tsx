import { useMemo } from 'react';
import type { DashboardStateShape } from '../../../hooks/useDashboardState';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import type { DashboardSection, Widget } from '../../../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import { SectionCardRenderer, WidgetCardRenderer } from '../../widgets/CardRenderer';
import type { GridLayoutItem } from './model';

export type GridEditorHouseMember = Readonly<{
  id: string;
  name: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
}>;

export type GridEditorRealCardProps = Readonly<{
  dashboard: Readonly<DashboardLayoutConfiguration>;
  visualWidgets: readonly Widget[];
  dashboardState: DashboardStateShape;
  haStates: MockEntityStateMap;
  sensorHistoryByEntity: Readonly<Record<string, number[]>>;
  houseMembers: readonly GridEditorHouseMember[];
  item: GridLayoutItem;
  breakpoint: DashboardGridBreakpoint;
  selected: boolean;
}>;

const STACK_KINDS = new Set<DashboardSection['kind']>([
  'stack-vertical',
  'stack-horizontal',
  'stack-grid',
]);

const NO_OPERATION = () => undefined;

function liveEntityFor(widget: Widget, haStates: MockEntityStateMap): MockEntityState | undefined {
  return haStates[widget.entityId] ?? haStates[widget.entityId.toLowerCase()];
}

function VisualOnlyWidget({
  widget,
  layout,
  dashboardState,
  haStates,
  sensorHistoryByEntity,
  houseMembers,
  breakpoint,
  selected,
}: Readonly<{
  widget: Widget;
  layout: GridLayoutItem;
  dashboardState: DashboardStateShape;
  haStates: MockEntityStateMap;
  sensorHistoryByEntity: Readonly<Record<string, number[]>>;
  houseMembers: readonly GridEditorHouseMember[];
  breakpoint: DashboardGridBreakpoint;
  selected: boolean;
}>) {
  const visualWidget = useMemo<Widget>(() => ({
    ...widget,
    layout: { ...layout, i: widget.id },
  }), [layout, widget]);
  const visualHouseMembers = useMemo(
    () => houseMembers.map((member) => ({ ...member })),
    [houseMembers],
  );
  const liveEntity = liveEntityFor(visualWidget, haStates);

  return (
    <div
      data-experimental-card-kind={visualWidget.kind}
      data-experimental-renderer="WidgetCardRenderer"
      data-experimental-operational-controls="disabled"
      className="h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <WidgetCardRenderer
        widget={visualWidget}
        dashboardState={dashboardState}
        isEditMode
        isInteractive={false}
        isSelected={selected}
        value={liveEntity?.numericValue ?? visualWidget.value}
        sensorHistory={sensorHistoryByEntity[visualWidget.entityId]}
        sensorBatteryEntity={visualWidget.sensorBatteryEntityId
          ? haStates[visualWidget.sensorBatteryEntityId] ?? haStates[visualWidget.sensorBatteryEntityId.toLowerCase()]
          : undefined}
        switchConsumptionEntity={visualWidget.switchConsumptionEntityId
          ? haStates[visualWidget.switchConsumptionEntityId] ?? haStates[visualWidget.switchConsumptionEntityId.toLowerCase()]
          : undefined}
        onClick={NO_OPERATION}
        liveEntity={liveEntity}
        gridBreakpoint={breakpoint}
        houseMembers={visualHouseMembers}
      />
    </div>
  );
}

function VisualOnlyStack({
  section,
  dashboard,
  visualWidgets,
  dashboardState,
  haStates,
  sensorHistoryByEntity,
  houseMembers,
  breakpoint,
}: Omit<GridEditorRealCardProps, 'item' | 'selected'> & Readonly<{ section: DashboardSection }>) {
  const children = visualWidgets.filter((widget) => widget.parentSectionId === section.id);
  const responsiveLayout = dashboard.responsiveLayouts.stacks?.[section.id]?.[breakpoint];
  const layoutById = new Map(responsiveLayout?.map((layout) => [layout.i, layout]));
  const childLayouts = children.map((widget) => layoutById.get(widget.id) ?? widget.layout);
  const columns = Math.max(
    1,
    section.stackColumns ?? 1,
    ...childLayouts.map((layout) => layout.x + layout.w),
  );
  const rows = Math.max(1, ...childLayouts.map((layout) => layout.y + layout.h));
  const title = section.title?.trim();
  const showHeader = section.stackShowHeader !== false && Boolean(title);
  const showBackground = section.stackShowBackground ?? true;
  const showBorder = section.stackShowBorder ?? true;

  return (
    <div
      data-experimental-card-kind={section.kind}
      data-experimental-renderer="SafeStackProjection"
      data-stack-child-count={children.length}
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[1.6rem] ${
        showBackground ? 'bg-white/[0.04] shadow-lg backdrop-blur-xl' : 'bg-transparent'
      } ${showBorder ? 'ring-1 ring-inset ring-white/[0.08]' : ''}`}
    >
      {showHeader ? (
        <div className="flex h-10 shrink-0 items-center px-3">
          <p className="truncate text-xs font-semibold tracking-tight text-white/70">{title}</p>
          <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-white/40">
            Stack atomico
          </span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden p-1.5">
        <div
          className="grid h-full min-h-0 w-full min-w-0 gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(36px, 1fr))`,
          }}
        >
          {children.map((widget) => {
            const layout = layoutById.get(widget.id) ?? widget.layout;
            return (
              <div
                key={widget.id}
                data-testid={`experimental-stack-child-${widget.id}`}
                className="min-h-0 min-w-0 overflow-hidden rounded-xl"
                style={{
                  gridColumn: `${layout.x + 1} / span ${Math.max(1, layout.w)}`,
                  gridRow: `${layout.y + 1} / span ${Math.max(1, layout.h)}`,
                }}
              >
                <VisualOnlyWidget
                  widget={widget}
                  layout={layout}
                  dashboardState={dashboardState}
                  haStates={haStates}
                  sensorHistoryByEntity={sensorHistoryByEntity}
                  houseMembers={houseMembers}
                  breakpoint={breakpoint}
                  selected={false}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GridEditorRealCard({
  dashboard,
  visualWidgets,
  dashboardState,
  haStates,
  sensorHistoryByEntity,
  houseMembers,
  item,
  breakpoint,
  selected,
}: GridEditorRealCardProps) {
  const widget = visualWidgets.find((entry) => entry.id === item.i)
    ?? dashboard.widgets.find((entry) => entry.id === item.i);
  if (widget) {
    return (
      <VisualOnlyWidget
        widget={widget}
        layout={item}
        dashboardState={dashboardState}
        haStates={haStates}
        sensorHistoryByEntity={sensorHistoryByEntity}
        houseMembers={houseMembers}
        breakpoint={breakpoint}
        selected={selected}
      />
    );
  }

  const section = dashboard.sections.find((entry) => entry.id === item.i);
  if (!section) {
    return (
      <div
        role="img"
        aria-label={`Elemento ${item.i} non disponibile`}
        data-experimental-renderer="Unavailable"
        className="flex h-full items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-center text-xs text-amber-50/70"
      >
        Contenuto non disponibile · {item.i}
      </div>
    );
  }

  if (STACK_KINDS.has(section.kind)) {
    return (
      <VisualOnlyStack
        section={{ ...section, layout: { ...item, i: section.id } }}
        dashboard={dashboard}
        visualWidgets={visualWidgets}
        dashboardState={dashboardState}
        haStates={haStates}
        sensorHistoryByEntity={sensorHistoryByEntity}
        houseMembers={houseMembers}
        breakpoint={breakpoint}
      />
    );
  }

  const visualSection: DashboardSection = { ...section, layout: { ...item, i: section.id } };
  const compact = item.h <= 2 || item.w <= 3;
  return (
    <div
      data-experimental-card-kind={visualSection.kind}
      data-experimental-renderer="SectionCardRenderer"
      data-experimental-operational-controls="disabled"
      className="h-full min-h-0 w-full min-w-0 overflow-hidden rounded-[1.6rem]"
    >
      <SectionCardRenderer
        section={visualSection}
        state={dashboardState}
        compact={compact}
        isEditMode
      />
    </div>
  );
}

export default GridEditorRealCard;
