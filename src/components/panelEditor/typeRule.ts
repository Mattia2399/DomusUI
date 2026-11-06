import type { WidgetTypeBreakpointLayoutOverride } from '../../types/widgetTypeLayout';

type Overrides = Readonly<Record<string, WidgetTypeBreakpointLayoutOverride | undefined>> | undefined;

/**
 * The widths of the grid where this card takes its size from the rule of its kind:
 * there is a rule for the kind and none for the card.
 */
export function typeRuleBreakpoints(byType: Overrides, byCard: Overrides): string[] {
  return Object.entries(byType ?? {})
    .filter(([breakpoint, override]) => Boolean(override) && !byCard?.[breakpoint])
    .map(([breakpoint]) => breakpoint);
}

/** The card keeps the size the rule gives it now, as its own, at each of those widths. */
export function copyRuleToCard(byType: Overrides, breakpoints: readonly string[], setForCard: (breakpoint: string, override: WidgetTypeBreakpointLayoutOverride) => void) {
  breakpoints.forEach((breakpoint) => {
    const rule = byType?.[breakpoint];
    if (rule) setForCard(breakpoint, { ...rule });
  });
}

/** The rule goes away for every card of the kind, at every width it was set for. */
export function removeRule(byType: Overrides, setForType: (breakpoint: string, override: null) => void) {
  Object.entries(byType ?? {}).forEach(([breakpoint, override]) => {
    if (override) setForType(breakpoint, null);
  });
}
