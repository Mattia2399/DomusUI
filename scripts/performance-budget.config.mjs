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
  // Startup: index.html, its entry chunk, the global stylesheet and exactly one
  // language catalog with the words of first-run setup in that language, which
  // start loading with it. French is the largest of both, so it guards the worst case.
  // Baseline before locale splitting: 1,154,500 / 252,300.
  // Headroom ~4% (warning) and ~8% (limit): every byte here delays the first paint.
  {
    id: 'boot', label: 'Boot', sources: ['index.html', 'virtual:domus-i18n/fr', 'src/i18n/onboarding/fr.ts'],
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
    id: 'rooms', label: 'Stanze', sources: ['src/pages/rooms/RoomsPage.tsx'], requires: 'home', kind: 'route',
    budget: { metric: 'incremental', raw: { warning: 300 * KB, limit: 330 * KB }, gzip: { warning: 90 * KB, limit: 100 * KB } },
  },
  // What /rooms opens on request (device panels, section pages, sheets, management), fetched when idle. Baseline 106,000 / 38,600.
  // The entries of the panel registry are not here: each loads apart, as soon as a card of its kind shows (panels/panelPreload.ts).
  {
    id: 'rooms-parts', label: 'Stanze · pannelli e gestione', requires: 'rooms', kind: 'feature',
    sources: [
      'src/components/devices/panels/Panel.tsx',
      'src/components/devices/panels/PanelLiveGate.tsx',
      'src/components/devices/panels/SecurityPanel.tsx',
      'src/components/devices/panels/MediaPlayer.tsx',
      'src/pages/rooms/MediaSheets.tsx',
      'src/pages/rooms/SectionPage.tsx',
      'src/pages/rooms/AddAccessoriesSheet.tsx',
      'src/pages/rooms/RoomsManagePage.tsx',
      'src/pages/rooms/RoomManageSheets.tsx',
    ],
    // gzip limit 46 -> 47 KB (2026-11-09): the switch-off timer of the lights in the Rooms, and the bytes that
    // move between these pieces each time the main package of the Home changes (the short names they import by).
    budget: { metric: 'incremental', raw: { warning: 115 * KB, limit: 125 * KB }, gzip: { warning: 42 * KB, limit: 47 * KB } },
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

  // Alternative language catalogs are fetched only after the user changes
  // language. French is already counted in Boot as the largest startup case.
  { id: 'locale-it', label: 'Lingua · Italiano', sources: ['virtual:domus-i18n/it', 'src/i18n/onboarding/it.ts'], requires: 'boot', kind: 'feature' },
  { id: 'locale-en', label: 'Lingua · English', sources: ['virtual:domus-i18n/en', 'src/i18n/onboarding/en.ts'], requires: 'boot', kind: 'feature' },

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
  // The Water and Gas preview charts and the chart library (Recharts), loaded
  // when one of those details opens (PERF.E1). Reported only: a budget of its
  // own is a proposal in docs/performance-energy-bundle.md.
  { id: 'consumption-charts', label: 'Consumi · Grafici Acqua e Gas', sources: ['src/pages/consumi/consumptionCharts.tsx'], requires: 'consumi', kind: 'feature' },
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

  // Settings › This device features, measured as what they add to Settings
  // (their pages and the code they load on demand). Their always-on part is
  // small and lives in Home (the screensaver countdown, the Kiosk gate), so
  // Home's budget covers it. PERF.1 baselines (raw / gzip), ~20% warning, ~35% limit.
  // Power and charging: its page, client and words (32,800 / 10,900), plus the
  // entity picker it shares with App Gallery and the right sidebar (GlassCombobox
  // with its list virtualizer, 45,300 / 14,500), not loaded by Settings itself.
  // Baseline 78,200 / 25,600.
  {
    id: 'device-power', label: 'Questo dispositivo · Alimentazione', sources: ['src/components/settings/DevicePowerSettings.tsx'], requires: 'settings', kind: 'feature',
    budget: { metric: 'incremental', raw: { warning: 94 * KB, limit: 105 * KB }, gzip: { warning: 31 * KB, limit: 35 * KB } },
  },
  // Screensaver: its settings page and the overlay shown when idle (loaded ahead once it is on). Baseline 15,600 / 6,200.
  {
    id: 'screensaver', label: 'Questo dispositivo · Screensaver', requires: 'settings', kind: 'feature',
    sources: ['src/components/settings/ScreensaverSettings.tsx', 'src/components/screensaver/ScreensaverOverlay.tsx'],
    budget: { metric: 'incremental', raw: { warning: 18.5 * KB, limit: 21 * KB }, gzip: { warning: 7.5 * KB, limit: 8.5 * KB } },
  },
  // Kiosk: its settings page and the running panel (full screen, wake lock, the way out). Baseline 17,400 / 7,100.
  {
    id: 'kiosk', label: 'Questo dispositivo · Kiosk', requires: 'settings', kind: 'feature',
    sources: ['src/components/settings/KioskSettings.tsx', 'src/components/kiosk/KioskRuntime.tsx'],
    budget: { metric: 'incremental', raw: { warning: 20 * KB, limit: 23 * KB }, gzip: { warning: 8 * KB, limit: 9 * KB } },
  },

  // Reported only: small administrative panels, below any useful budget.
  { id: 'settings-management', label: 'Gestione impostazioni', sources: ['src/components/settings/SettingsManagementPanel.tsx'], requires: 'home', kind: 'feature' },
  // The drifting cards behind the setup intro, loaded after its words.
  { id: 'setup-mosaic', label: 'Onboarding · Sfondo della intro', sources: ['src/components/onboarding/SetupMosaic.tsx'], requires: 'onboarding', kind: 'feature' },
  // The three-step guides of the Home: after setup, and on the first device opened.
  { id: 'first-run-guide', label: 'Guida del primo accesso', sources: ['src/components/onboarding/FirstRunGuide.tsx'], requires: 'home', kind: 'feature' },
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
 * PERF.1: the This device features got theirs (above); what remains is the
 * deeper Settings and Profile sections, the recipient picker and the
 * onboarding organizer, listed by the report. The warning is unchanged.
 */
export const unattributed = { raw: { warning: 150 * KB } };

/* Static files outside JS and CSS (images, styles, fonts): reported, not budgeted. */
export const largeStaticFile = 300 * KB;
