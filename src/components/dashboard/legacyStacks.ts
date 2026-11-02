import type { DashboardLayoutConfiguration } from '../../services/dashboardConfigurationRepository';
import type { DashboardSection, SectionKind, Widget } from '../../types/dashboardModels';

/*
 * Stacks are suspended: they will come back, rewritten, as Groups on Grid
 * Engine 2.0. Until then a saved Stack still renders as it was, but the Home
 * editor neither creates nor changes one, no automatic mode touches its
 * geometry, and a save that would change one is refused. Nothing here edits
 * or removes stored data.
 */

export const LEGACY_STACKS_READ_ONLY = true;

const STACK_SECTION_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>([
  'stack-vertical',
  'stack-horizontal',
  'stack-grid',
]);

export function isLegacyStackKind(kind: SectionKind) {
  return STACK_SECTION_KINDS.has(kind);
}

export function isLegacyStackSection(section: Pick<DashboardSection, 'kind'> | undefined | null) {
  return Boolean(section && STACK_SECTION_KINDS.has(section.kind));
}

/** A card that lives inside a saved Stack. */
export function isLegacyStackChild(
  widget: Pick<Widget, 'parentSectionId'> | undefined | null,
  sections: readonly Pick<DashboardSection, 'id' | 'kind'>[],
) {
  if (!widget?.parentSectionId) return false;
  return isLegacyStackSection(sections.find((section) => section.id === widget.parentSectionId));
}

export function hasLegacyStacks(dashboard: Pick<DashboardLayoutConfiguration, 'sections'>) {
  return dashboard.sections.some(isLegacyStackSection);
}

export const LEGACY_STACK_READ_ONLY_MESSAGE =
  'Gli Stack sono sospesi: quelli salvati restano visibili ma non si modificano. Torneranno come Gruppi.';

export const LEGACY_STACK_OPERATION_BLOCKED_MESSAGE =
  'La Home contiene Stack salvati: questa operazione ne riscriverebbe la disposizione, quindi è bloccata finché gli Stack non torneranno come Gruppi.';

type StackView = Pick<
  DashboardLayoutConfiguration,
  'sections' | 'widgets' | 'responsiveLayouts' | 'widgetLayoutOverrides' | 'widgetTypeLayoutOverrides'
>;

/**
 * Everything a Stack is made of: its settings, its cards, where they sit
 * inside it and the sizes of their card types ("apply to all" reaches them).
 * Its place on the main grid is not included (moving a whole Stack keeps it
 * intact), nor its height, which follows its unchanged content.
 */
function legacyStackFingerprint(dashboard: StackView) {
  const stacks = dashboard.sections
    .filter(isLegacyStackSection)
    .map(({ layout: _layout, ...settings }) => settings)
    .sort((first, second) => first.id.localeCompare(second.id));
  const stackIds = new Set(stacks.map((stack) => stack.id));
  const children = dashboard.widgets
    .filter((widget) => widget.parentSectionId && stackIds.has(widget.parentSectionId))
    .map((widget) => ({
      id: widget.id,
      kind: widget.kind,
      entityId: widget.entityId,
      parentSectionId: widget.parentSectionId,
      layout: { x: widget.layout.x, y: widget.layout.y, w: widget.layout.w, h: widget.layout.h },
      overrides: dashboard.widgetLayoutOverrides[widget.id] ?? null,
    }))
    .sort((first, second) => first.id.localeCompare(second.id));
  const innerLayouts = [...stackIds].sort().map((id) => [id, dashboard.responsiveLayouts.stacks?.[id] ?? null]);
  const typeSizes = [...new Set(children.map((child) => child.kind))]
    .sort()
    .map((kind) => [kind, dashboard.widgetTypeLayoutOverrides[kind] ?? null]);
  return JSON.stringify({ stacks, children, innerLayouts, typeSizes });
}

/** Why a save must not go ahead: a saved Stack is not what it was when editing started. */
export function describeLegacyStackChange(baseline: StackView, current: StackView): string | null {
  if (!hasLegacyStacks(baseline) && !hasLegacyStacks(current)) return null;
  return legacyStackFingerprint(baseline) === legacyStackFingerprint(current)
    ? null
    : 'Uno Stack salvato risulta modificato: il salvataggio è bloccato per non alterarlo. Usa Scarta per tornare alla disposizione iniziale.';
}
