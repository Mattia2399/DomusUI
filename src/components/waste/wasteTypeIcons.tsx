import {
  Apple,
  Baby,
  Battery,
  Cpu,
  CupSoda,
  Droplet,
  Leaf,
  Lightbulb,
  Newspaper,
  Package,
  Pill,
  Recycle,
  Shirt,
  Sofa,
  Trash2,
  TreeDeciduous,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { IconBadge } from '../ui/IconBadge';

// Icons are stored as Material Design Icon names so Home Assistant keeps a
// meaningful value; the dashboard draws them with the matching Lucide glyph.
export const WASTE_TYPE_ICONS = [
  { id: 'mdi:leaf', Icon: Leaf, labelKey: 'waste.icon.organic' },
  { id: 'mdi:food-apple', Icon: Apple, labelKey: 'waste.icon.food' },
  { id: 'mdi:package-variant', Icon: Package, labelKey: 'waste.icon.cardboard' },
  { id: 'mdi:newspaper', Icon: Newspaper, labelKey: 'waste.icon.paper' },
  { id: 'mdi:recycle', Icon: Recycle, labelKey: 'waste.icon.recycling' },
  { id: 'mdi:bottle-soda', Icon: Wine, labelKey: 'waste.icon.glass' },
  { id: 'mdi:cup', Icon: CupSoda, labelKey: 'waste.icon.cans' },
  { id: 'mdi:trash-can', Icon: Trash2, labelKey: 'waste.icon.residual' },
  { id: 'mdi:tree', Icon: TreeDeciduous, labelKey: 'waste.icon.garden' },
  { id: 'mdi:tshirt-crew', Icon: Shirt, labelKey: 'waste.icon.clothes' },
  { id: 'mdi:baby-carriage', Icon: Baby, labelKey: 'waste.icon.nappies' },
  { id: 'mdi:battery', Icon: Battery, labelKey: 'waste.icon.batteries' },
  { id: 'mdi:lightbulb', Icon: Lightbulb, labelKey: 'waste.icon.bulbs' },
  { id: 'mdi:chip', Icon: Cpu, labelKey: 'waste.icon.electronics' },
  { id: 'mdi:water', Icon: Droplet, labelKey: 'waste.icon.oil' },
  { id: 'mdi:pill', Icon: Pill, labelKey: 'waste.icon.medicines' },
  { id: 'mdi:sofa', Icon: Sofa, labelKey: 'waste.icon.bulky' },
] as const;

export type WasteTypeIconId = (typeof WASTE_TYPE_ICONS)[number]['id'];

const ICON_ALIASES: Record<string, LucideIcon> = {
  'mdi:trash-can-outline': Trash2,
  'mdi:package': Package,
  'mdi:bottle-wine': Wine,
  'mdi:glass-fragile': Wine,
};

export function resolveWasteTypeIcon(icon: string | undefined): LucideIcon {
  if (!icon) return Trash2;
  return WASTE_TYPE_ICONS.find((item) => item.id === icon)?.Icon ?? ICON_ALIASES[icon] ?? Trash2;
}

/** Filled circle in the waste type color with its icon drawn on top. */
export function WasteTypeBadge({
  icon,
  color,
  size = 28,
  className = '',
}: {
  icon: string | undefined;
  color: string;
  size?: number;
  className?: string;
}) {
  return <IconBadge Icon={resolveWasteTypeIcon(icon)} color={color} size={size} className={className} />;
}
