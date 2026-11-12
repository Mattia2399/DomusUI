import { createLucideIcon } from 'lucide-react';

/*
 * Icons that lucide does not have, drawn as in the prototypes (docs/design/app/), with the same
 * props as every lucide icon (size, strokeWidth, colour). One place for them.
 */

/** A window: a rounded upright rectangle with its cross (sicurezza.html, `window`). */
export const WindowIcon = createLucideIcon('window', [
  ['rect', { x: '4', y: '3', width: '16', height: '18', rx: '2', key: 'window-frame' }],
  ['path', { d: 'M12 3v18M4 12h16', key: 'window-cross' }],
]);
