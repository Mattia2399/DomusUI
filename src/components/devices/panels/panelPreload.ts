import React from 'react';
import { loadPanelEntry, type PanelKind } from './registry';

/*
 * The entry of a panel loads apart, and nobody should wait for it on the tap. A card asks
 * for its kind while the browser is free, at once when it enters the screen, and at the
 * latest when a finger or a mouse reaches it. The same rule in the Home and in Rooms.
 */

const asked = new Set<PanelKind>();
const waiting = new Set<PanelKind>();
let observer: IntersectionObserver | null = null;
const kindOf = new WeakMap<Element, PanelKind>();

export function preloadPanel(kind: PanelKind) {
  if (asked.has(kind)) return;
  asked.add(kind);
  waiting.delete(kind);
  // What could not be fetched is asked again the next time.
  void loadPanelEntry(kind).catch(() => asked.delete(kind));
}

function preloadWhenIdle(kind: PanelKind) {
  if (asked.has(kind) || waiting.has(kind)) return;
  waiting.add(kind);
  if (waiting.size > 1) return;
  const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 600));
  idle(() => [...waiting].forEach(preloadPanel));
}

function watch(node: Element, kind: PanelKind) {
  if (typeof IntersectionObserver === 'undefined') return undefined;
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const seen = kindOf.get(entry.target);
      if (!entry.isIntersecting || !seen) continue;
      preloadPanel(seen);
      observer?.unobserve(entry.target);
    }
  });
  kindOf.set(node, kind);
  observer.observe(node);
  return () => observer?.unobserve(node);
}

/** What the root of a card spreads, so that the panel it opens is ready before the tap. */
export function usePanelPreload(kind: PanelKind | null | undefined) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!kind || asked.has(kind)) return undefined;
    preloadWhenIdle(kind);
    return ref.current ? watch(ref.current, kind) : undefined;
  }, [kind]);
  if (!kind) return { ref };
  const reached = () => preloadPanel(kind);
  return { ref, onPointerEnter: reached, onPointerDown: reached };
}
