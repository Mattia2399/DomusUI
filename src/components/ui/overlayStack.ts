/*
 * What is open over the page, in order: dialogs, sheets and subpages. Esc closes only the
 * one on top, so that a sheet opened from a subpage closes before the subpage does.
 */

const openOverlays: string[] = [];

export function pushOverlay(id: string) {
  openOverlays.push(id);
}

export function removeOverlay(id: string) {
  const index = openOverlays.lastIndexOf(id);
  if (index >= 0) openOverlays.splice(index, 1);
}

export function isTopOverlay(id: string) {
  return openOverlays.at(-1) === id;
}
