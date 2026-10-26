/*
 * How a room section orders its devices and what it shows in the room.
 * First the ones in evidence, in the order they were chosen; then the ones to
 * check, the ones on, and the rest by name. The room shows at most four; with
 * more, three and a "+N" card. Hidden devices never show in the room.
 */

export const SECTION_PREVIEW_MAX = 4;

export type SectionItem = {
  id: string;
  name: string;
  /** Position among the devices in evidence, or null. */
  pinRank: number | null;
  needsAttention: boolean;
  active: boolean;
  hidden: boolean;
};

export function compareBySectionRule(a: SectionItem, b: SectionItem, locale = 'it') {
  const aPinned = a.pinRank !== null;
  const bPinned = b.pinRank !== null;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (aPinned && bPinned && a.pinRank !== b.pinRank) return (a.pinRank as number) - (b.pinRank as number);
  if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.name.localeCompare(b.name, locale, { sensitivity: 'base' });
}

export function sortBySectionRule<T extends SectionItem>(items: T[], locale = 'it') {
  return [...items].sort((a, b) => compareBySectionRule(a, b, locale));
}

export type SectionPreview<T> = {
  items: T[];
  /** Devices behind the "+N" card; 0 when there is none. */
  more: number;
  hiddenCount: number;
  allHidden: boolean;
};

export function buildSectionPreview<T extends SectionItem>(
  items: T[],
  locale = 'it',
  max = SECTION_PREVIEW_MAX,
): SectionPreview<T> {
  const shown = sortBySectionRule(
    items.filter((item) => !item.hidden),
    locale,
  );
  const hiddenCount = items.length - shown.length;
  const allHidden = items.length > 0 && shown.length === 0;
  if (shown.length <= max) return { items: shown, more: 0, hiddenCount, allHidden };
  return { items: shown.slice(0, max - 1), more: shown.length - (max - 1), hiddenCount, allHidden };
}

export type SectionPageGroups<T> = { pinned: T[]; others: T[]; hidden: T[] };

/** The groups of the section page, filtered by a search on the name. */
export function groupSectionPage<T extends SectionItem>(items: T[], query = '', locale = 'it'): SectionPageGroups<T> {
  const needle = query.trim().toLocaleLowerCase(locale);
  const matching = items.filter((item) => !needle || item.name.toLocaleLowerCase(locale).includes(needle));
  const sorted = sortBySectionRule(matching, locale);
  return {
    pinned: sorted.filter((item) => item.pinRank !== null && !item.hidden),
    others: sorted.filter((item) => item.pinRank === null && !item.hidden),
    hidden: sorted.filter((item) => item.hidden),
  };
}

/*
 * The devices in evidence after the selection is pinned or unpinned. When
 * every selected device is already in evidence they leave it; otherwise the
 * new ones join at the end, in the order they are listed.
 */
export function togglePinned(pinned: string[], selected: string[]) {
  const pinnedSet = new Set(pinned);
  if (selected.length > 0 && selected.every((id) => pinnedSet.has(id))) {
    const leaving = new Set(selected);
    return pinned.filter((id) => !leaving.has(id));
  }
  return [...pinned, ...selected.filter((id) => !pinnedSet.has(id))];
}

/** The rank of each pinned id, in the order they were chosen. */
export function pinRanks(pinned: string[]) {
  return new Map(pinned.map((id, index) => [id, index + 1]));
}
