/**
 * Shared constants for the Domus UI presentation site.
 *
 * Motion values mirror the CSS tokens in site.css so Framer Motion timelines
 * and CSS transitions share one rhythm.
 */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  base: 0.42,
  slow: 0.9,
  cinematic: 1.4,
} as const;

/** Spring used to smooth scroll-linked values without feeling laggy. */
export const SCROLL_SPRING = { stiffness: 140, damping: 30, mass: 0.35 } as const;

/** Layout spring for cards that reflow between breakpoints. */
export const LAYOUT_SPRING = { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 } as const;

export const SECTION_IDS = {
  top: 'top',
  layouts: 'layouts',
  cards: 'cards',
  live: 'live',
  apps: 'apps',
  trust: 'trust',
  install: 'install',
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

export const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: SECTION_IDS.layouts, label: 'Layout' },
  { id: SECTION_IDS.cards, label: 'Card' },
  { id: SECTION_IDS.live, label: 'Live' },
  { id: SECTION_IDS.apps, label: 'App' },
  { id: SECTION_IDS.trust, label: 'Sicurezza' },
  { id: SECTION_IDS.install, label: 'Installa' },
];

const REPOSITORY = 'https://github.com/Mattia2399/DomusUI';

/** Only links that actually exist for the project. */
export const SITE_LINKS = {
  repository: REPOSITORY,
  releases: `${REPOSITORY}/releases`,
  installGuide: `${REPOSITORY}/blob/main/docs/installation-beta.md`,
  featureStatus: `${REPOSITORY}/blob/main/docs/feature-status.md`,
  security: `${REPOSITORY}/blob/main/docs/security-and-privacy.md`,
  changelog: `${REPOSITORY}/blob/main/CHANGELOG.md`,
  issues: `${REPOSITORY}/issues/new?template=bug_report.yml`,
  discussions: `${REPOSITORY}/discussions`,
  license: `${REPOSITORY}/blob/main/LICENSE`,
  hacs: 'https://my.home-assistant.io/redirect/hacs_repository/?owner=Mattia2399&repository=DomusUI&category=integration',
} as const;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
