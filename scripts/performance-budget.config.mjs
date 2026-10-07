/*
 * Performance Budget V2 of the Domus UI distribution (HACS and release
 * package). Every number is versioned here and changes only by an explicit
 * edit with a documented reason (docs/performance-budget.md): the check never
 * derives a limit from the current build.
 *
 * Measures (scripts/performance-budget/metrics.mjs):
 * - cold: every JS and CSS file a surface needs from an empty cache, its
 *   parent surfaces included, each file counted once;
 * - incremental: what a surface adds to its parent (`requires`), e.g. a route
 *   opened from an already loaded Home;
 * - raw: bytes on disk (parsing and the size shipped); gzip: default zlib
 *   level (what travels on the wire). Both are checked.
 *
 * Baselines: A2.0 build (commit 16a7226), raw / gzip in bytes, rounded.
 * Headroom: small on the startup path, moderate on routes, larger on
 * administrative or on-demand features and on the distribution total.
 */

const KB = 1_000;
const MB = 1_000_000;

/** Surfaces, named by source module id; `requires` is what is already loaded. */
export const surfaces = [
  // Startup: index.html, its entry chunk and the global stylesheet. Baseline 1,154,500 / 252,300.
  // Headroom ~4% (warning) and ~8% (limit): every byte here delays the first paint.
  {
    id: 'boot', label: 'Boot', sources: ['index.html'],
    budget: { metric: 'cold', raw: { warning: 1.2 * MB, limit: 1.25 * MB }, gzip: { warning: 265 * KB, limit: 275 * KB } },
  },
  // Home and the dashboard shell every route lives in. Baseline 2,437,600 / 615,700 cold.
  // Same tightness as the V1 Home critical path (JS only, 2.1 MB / 600 KB for 1.90 MB / 0.54 MB), now with CSS.
  {
    id: 'home', label: 'Home', sources: ['src/pages/Home.tsx'], requires: 'boot',
    budget: { metric: 'cold', raw: { warning: 2.55 * MB, limit: 2.65 * MB }, gzip: { warning: 645 * KB, limit: 670 * KB } },
  },
  // First-run onboarding, before any Home. Baseline 89,400 / 28,100 over boot.
  {
    id: 'onboarding', label: 'Onboarding', sources: ['src/components/onboarding/OnboardingExperience.tsx'], requires: 'boot', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 105 * KB, limit: 120 * KB }, gzip: { warning: 33 * KB, limit: 38 * KB } },
  },

  // Routes, measured as what they add to Home (~10% warning, ~20% limit).
  // /consumi and /consumi/energia (the Energy page is part of Consumi). Baseline 528,700 / 162,200.
  {
    id: 'consumi', label: 'Consumi · Energia', sources: ['src/pages/Consumi.tsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 580 * KB, limit: 650 * KB }, gzip: { warning: 180 * KB, limit: 200 * KB } },
  },
  // /rooms. Baseline 266,400 / 78,800.
  {
    id: 'rooms', label: 'Stanze', sources: ['src/pages/RoomsDashboard.tsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 300 * KB, limit: 330 * KB }, gzip: { warning: 90 * KB, limit: 100 * KB } },
  },
  // /security. Baseline 123,400 / 41,400.
  {
    id: 'security', label: 'Sicurezza', sources: ['src/pages/SecurityDashboard.jsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 140 * KB, limit: 160 * KB }, gzip: { warning: 48 * KB, limit: 55 * KB } },
  },
  // /appgallery: Irrigazione and the technical-room preview (Locale Tecnico) are App Gallery apps. Baseline 234,000 / 65,000.
  {
    id: 'appgallery', label: 'App Gallery · Irrigazione · Locale Tecnico', sources: ['src/pages/AppGallery.jsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 260 * KB, limit: 290 * KB }, gzip: { warning: 72 * KB, limit: 80 * KB } },
  },
  // /settings and /support. Baseline 443,700 / 134,200.
  {
    id: 'settings', label: 'Impostazioni', sources: ['src/pages/SettingsDashboard.tsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 490 * KB, limit: 540 * KB }, gzip: { warning: 148 * KB, limit: 165 * KB } },
  },
  // /automations (automation builder). Baseline 7,100 / 3,100: a floor of a few tens of KB, not a percentage.
  {
    id: 'automations', label: 'Automazioni', sources: ['src/pages/AutomationsBuilder.jsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 20 * KB, limit: 30 * KB }, gzip: { warning: 8 * KB, limit: 12 * KB } },
  },
  // /profile. Baseline 36,300 / 11,600.
  {
    id: 'profile', label: 'Profilo', sources: ['src/components/settings/ModernProfilePage.tsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 45 * KB, limit: 55 * KB }, gzip: { warning: 15 * KB, limit: 18 * KB } },
  },

  // On-demand features, loaded only after a user action, measured over their parent (~15-20% warning, ~30-40% limit).
  // Energy setup wizard, from /consumi/energia. Baseline 105,700 / 33,600.
  {
    id: 'energy-wizard', label: 'Energy · Setup Wizard', sources: ['src/pages/consumi/energy/EnergySetupWizard.tsx'], requires: 'consumi', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 130 * KB, limit: 150 * KB }, gzip: { warning: 40 * KB, limit: 46 * KB } },
  },
  // Energy settings, from /consumi/energia. Baseline 71,400 / 22,900.
  {
    id: 'energy-settings', label: 'Energy · Impostazioni', sources: ['src/pages/consumi/energy/EnergySettings.tsx'], requires: 'consumi', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 90 * KB, limit: 100 * KB }, gzip: { warning: 28 * KB, limit: 32 * KB } },
  },
  // Dashboard builder: the card catalog opened while editing Home. Baseline 44,500 / 16,000.
  {
    id: 'dashboard-builder', label: 'Builder · catalogo card', sources: ['src/components/dashboard/DashboardCatalogModal.tsx'], requires: 'home', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 55 * KB, limit: 65 * KB }, gzip: { warning: 20 * KB, limit: 24 * KB } },
  },
  // Right sidebar (editing and device panels). Baseline 245,400 / 62,600.
  {
    id: 'right-sidebar', label: 'Sidebar destra', sources: ['src/components/dashboard/RightSidebarManager.tsx'], requires: 'home', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 280 * KB, limit: 320 * KB }, gzip: { warning: 72 * KB, limit: 82 * KB } },
  },
  // Device and member context sidebar. Baseline 697,000 / 206,100.
  {
    id: 'context-sidebar', label: 'Sidebar contesto', sources: ['src/components/settings/ContextSidebar.tsx'], requires: 'home', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 760 * KB, limit: 840 * KB }, gzip: { warning: 225 * KB, limit: 250 * KB } },
  },
  // Members map: MapLibre runtime, its shared module, stylesheet and worker. Baseline 1,180,900 / 315,800.
  {
    id: 'members-map', label: 'Mappa membri (MapLibre)', requires: 'context-sidebar', kind: 'feature',
    sources: ['src/components/settings/MembersLocationMap.tsx', 'src/components/settings/maplibreRuntime.ts'],
    files: ['maplibre-gl-worker.js'],
    budget: { metric: 'incremental', raw: { warning: 1.25 * MB, limit: 1.35 * MB }, gzip: { warning: 335 * KB, limit: 360 * KB } },
  },

  // Reported only: small administrative panels, below any useful budget.
  { id: 'settings-management', label: 'Gestione impostazioni', sources: ['src/components/settings/SettingsManagementPanel.tsx'], requires: 'home', kind: 'feature' },
  { id: 'consumption-editor', label: 'Editor consumi', sources: ['src/components/settings/ConsumptionEditorSidebar.tsx'], requires: 'home', kind: 'feature' },
  { id: 'guided-setup', label: 'Configurazione guidata HA', sources: ['src/components/settings/GuidedSetupOverlay.tsx'], requires: 'home', kind: 'feature' },
];

/*
 * Single file: no JS or CSS file may grow into a monolith. Largest CSS: the
 * global stylesheet (406,827). Largest JS: the Home chunk (985,800), now one
 * file with the dashboard cards. Raised from 900 KB (the V1 entry limit) by
 * the production build fix: splitting the cards into their own chunk made the
 * two chunks import each other and the production Home failed to load; the
 * safe splits either moved ~585 KB into startup or depended on a fragile
 * module-ownership analysis. Home's real cost is guarded by its critical path
 * budget above, unchanged (and 1.4 KB lower with one chunk). Headroom ~6.5%
 * (warning) and ~11.5% (limit) on the Home chunk; the entry (747,672) keeps
 * its margin.
 */
export const singleFile = {
  js: { warning: 1.05 * MB, limit: 1.1 * MB },
  css: { warning: 450 * KB, limit: 500 * KB },
};

/*
 * Distribution total: every JS and CSS file in dist/assets, lazy code
 * included. Baseline 5,500,046 / 1,460,800. Startup and routes have their own
 * hard limits above, so the total guards against broad drift: about 4.4 MB of
 * the total is lazy (3.06 MB) or route code, and the recent growth (Energy
 * A1.x) was all lazy. Warning +5%, catastrophic cap +13%.
 */
export const total = {
  raw: { warning: 5.8 * MB, limit: 6.2 * MB },
  gzip: { warning: 1.55 * MB, limit: 1.65 * MB },
};

/*
 * Code no surface above reaches (deeper on-demand panels, new features).
 * Baseline 66,100 (settings sections, onboarding organizer, recovery and
 * starter-layout modals). A warning asks to give a growing feature its own surface.
 */
export const unattributed = { raw: { warning: 150 * KB } };

/* Static files outside JS and CSS (images, styles, fonts): reported, not budgeted. */
export const largeStaticFile = 300 * KB;
