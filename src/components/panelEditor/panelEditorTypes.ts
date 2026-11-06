import type React from 'react';
import type { MockEntityStateMap } from '../../types/ha';
import type { Widget } from '../../types/dashboardModels';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { WidgetTypeBreakpointLayoutOverride } from '../../types/widgetTypeLayout';
import type { SizeOption } from '../editor/SizePicker';

type Override = WidgetTypeBreakpointLayoutOverride;

/** What the sidebar gives the editor: the card, what it already computes for it, and the ways of today to save. */
export type PanelEditorProps = {
  widget: Widget;
  /** A phone: the editor goes in the sheet of the sidebar; otherwise it opens its own dialog. */
  compact: boolean;
  breakpoint: string;
  /** The real card, at its size, as the sidebar has always drawn it. */
  cardPreview: React.ReactNode;
  size: {
    options: readonly SizeOption[];
    /** The id of the size in use, or null for an older one. */
    active: string | null;
    current: { w: number; h: number };
    pick: (option: SizeOption) => void;
  };
  /** Only for lights: whether the card grows when the light is on. */
  lightGrowth?: { on: boolean; available: boolean; set: (on: boolean) => void };
  /** The size rules of this kind and of this card, at each width of the grid. */
  overrides: {
    byType: Readonly<Record<string, Override | undefined>> | undefined;
    byCard: Readonly<Record<string, Override | undefined>> | undefined;
    setForCard: (breakpoint: string, override: Override | null) => void;
    setForType: (breakpoint: string, override: Override | null) => void;
  };
  haStates: MockEntityStateMap;
  /** The entities of Home Assistant, and those of the demo by kind. */
  haEntityIds?: readonly string[];
  entityOptions?: Readonly<Record<string, readonly string[]>>;
  entityRegistry?: readonly HaEntityRegistryEntry[];
  areas?: readonly HaArea[];
  onUpdateWidget: (id: string, update: (widget: Widget) => Widget) => void;
  onRemove: () => void;
};
