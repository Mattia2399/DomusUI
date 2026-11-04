// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/assets/index.css'), 'utf8');

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function readComponentSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return readComponentSources(entryPath);
    return /\.(?:ts|tsx|jsx|css)$/.test(entry.name) && !entry.name.includes('.test.')
      ? [readFileSync(entryPath, 'utf8')]
      : [];
  });
}

describe('semantic theme CSS contract', () => {
  it('uses the native operating-system font stack, including iOS WebKit', () => {
    expect(css).toMatch(/--ui-font-system:\s*-apple-system,\s*BlinkMacSystemFont,\s*system-ui/);
    expect(css).toContain('font-family: var(--ui-font-system)');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).not.toContain('@font-face');
  });

  it.each([
    '--ui-bg-canvas',
    '--ui-bg-elevated',
    '--ui-panel-bg',
    '--ui-page-bg',
    '--ui-surface-glass',
    '--ui-text-primary',
    '--ui-text-secondary',
    '--ui-border',
    '--ui-accent',
    '--ui-success',
    '--ui-warning',
    '--ui-danger',
    '--ui-focus-ring',
    '--ui-scrim',
  ])('defines %s for both resolved appearances', (token) => {
    const occurrences = css.match(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'g')) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('uses one responsive title scale across the primary dashboard pages', () => {
    const titleConsumers = [
      'src/components/widgets/GreetingCard.tsx',
      // Rooms follows the larger title of its design board (rooms-title).
      'src/pages/SecurityDashboard.jsx',
      // Settings starts with the person instead of a visible title.
      'src/pages/Consumi.tsx',
    ].map(readSource);

    for (const consumer of titleConsumers) {
      expect(consumer).toContain('dashboard-page-title');
    }
    expect(css).toMatch(/\.dashboard-page-title\s*\{[\s\S]*?font-size:\s*2rem;[\s\S]*?line-height:\s*1\.08;/);
    expect(css).toMatch(/@media \(min-width: 640px\)[\s\S]*?\.dashboard-page-title\s*\{[\s\S]*?font-size:\s*2\.65rem;/);
    expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.dashboard-page-title\s*\{[\s\S]*?font-size:\s*3rem;/);
  });

  it('does not keep render selectors for removed Total White/Black backgrounds', () => {
    expect(css).not.toMatch(/dashboard-background-total-(white|black)/);
    expect(css).not.toMatch(/profile-background-thumb-total-(white|black)/);
    expect(css).not.toContain('dashboard-wallpaper-');
    expect(css).not.toContain('profile-wallpaper-thumb');
  });

  it('supports system accessibility preferences', () => {
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps Liquid Glass adaptive to live content with accessible fallbacks', () => {
    expect(css).toContain('.liquid-glass-navigation');
    expect(css).toContain('-webkit-backdrop-filter:');
    expect(css).toContain('backdrop-filter:');
    expect(css).toContain('--ui-glass-navigation-opacity');
    expect(css).toContain('@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))');
  });

  it('prevents new components from depending on the legacy profile token namespace', () => {
    const componentSource = readComponentSources(resolve(process.cwd(), 'src/components')).join('\n');
    expect(componentSource).not.toContain('--profile-sheet-');
    expect(css).not.toContain('--profile-sheet-');
  });

  it('keeps top-level content surfaces semantic and separate from floating glass', () => {
    expect(css).toContain('.dashboard-content-surface');
    expect(css).toMatch(/\.dashboard-content-surface[\s\S]*?var\(--ui-surface-secondary\)/);

    const settings = readSource('src/pages/SettingsDashboard.tsx');
    const security = readSource('src/pages/SecurityDashboard.jsx');
    const consumptions = readSource('src/pages/Consumi.tsx');
    const roomTiles = readSource('src/components/devices/theme/tokens.css');

    expect(settings).toContain('dashboard-content-surface');
    expect(settings).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    expect(security).toContain('dashboard-content-surface');
    expect(security).not.toContain('className="liquid-glass-panel rounded-[26px]');
    expect(consumptions).toContain('dashboard-content-surface');
    // The room tiles take their colours from tokens defined for both appearances, shared with setup.
    expect(roomTiles).toMatch(/\.dashboard-theme-dark\s*\{[\s\S]*?--dv-tile-off:/);
    expect(roomTiles).toMatch(/\.dashboard-theme-light\s*\{[\s\S]*?--dv-tile-off:/);
    expect(readSource('src/components/devices/theme/devices.css')).toContain("@import './tokens.css';");
  });

  it('keeps Builder and context-panel structure independent from white/black utility overrides', () => {
    const builder = readSource('src/components/dashboard/RightSidebarManager.tsx');
    const contextSidebar = readSource('src/components/settings/ContextSidebar.tsx');

    expect(builder).toContain('builder-sidebar');
    expect(builder).toContain('BUILDER_CONTENT_CARD_CLASS');
    expect(builder).toContain('<GlassToggle');
    expect(builder).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    expect(contextSidebar).toContain('context-content-surface');
    expect(contextSidebar).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
  });

  it('keeps the lock ring on semantic structural colors', () => {
    expect(readSource('src/components/widgets/LockRing.css')).toContain('var(--ui-surface-glass-strong)');
  });

  it('keeps the Home guides on the shared device tokens', () => {
    const guideCss = readSource('src/components/onboarding/firstRunGuide.css');

    expect(guideCss).toContain('var(--dv-sheet)');
    expect(guideCss).toContain('var(--dv-text)');
    expect(guideCss).not.toMatch(/bg-black(?:\/|\b)/);
  });

  it('keeps Sensor, Light and Switch cards semantic outside intrinsic light controls', () => {
    const sensorCss = readSource('src/components/widgets/SensorCard.css');
    const lightCss = readSource('src/components/widgets/LightCard.css');
    const switchCss = readSource('src/components/widgets/SwitchCard.css');
    const sensorSkeleton = readSource('src/components/settings/SensorDisplayVariantSkeleton.tsx');
    const lightSkeleton = readSource('src/components/settings/LightDisplayVariantSkeleton.tsx');
    const switchSkeleton = readSource('src/components/settings/SwitchDisplayVariantSkeleton.tsx');

    for (const cardCss of [sensorCss, lightCss, switchCss]) {
      expect(cardCss).toContain('var(--ui-text-primary)');
      expect(cardCss).toContain('var(--ui-border)');
    }
    expect(sensorCss).not.toMatch(/(?:color|background):\s*(?:white|#8f96aa)/);
    expect(switchCss).not.toMatch(/(?:color|background):\s*(?:white|#8f96aa)/);
    expect(lightCss).toContain('linear-gradient(90deg, #ff3b30');
    expect(lightCss).toContain('background: white');

    for (const skeleton of [sensorSkeleton, lightSkeleton, switchSkeleton]) {
      expect(skeleton).toContain('dashboard-content-surface-soft');
    }
    expect(sensorSkeleton).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    expect(switchSkeleton).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
  });

  it('keeps Climate, Alarm and Lock neutral states and skeletons theme-aware', () => {
    const climate = readSource('src/components/widgets/ClimateCard.tsx');
    const alarm = readSource('src/components/widgets/AlarmCardView.tsx');
    const lockCss = readSource('src/components/widgets/LockCard.css');
    const skeletons = [
      'src/components/settings/ClimateDisplayVariantSkeleton.tsx',
      'src/components/settings/AlarmDisplayVariantSkeleton.tsx',
      'src/components/settings/LockDisplayVariantSkeleton.tsx',
    ].map(readSource);

    expect(climate).toContain("gradient: 'from-[color:var(--ui-surface-glass)]");
    expect(climate).toContain('bg-[color:var(--ui-surface-glass-strong)]');
    expect(alarm).toContain("surface: 'bg-[color:var(--ui-surface-glass)]'");
    expect(alarm).toContain('bg-[color:var(--ui-surface-glass-strong)]');
    expect(lockCss).toContain('var(--ui-surface-glass)');
    expect(lockCss).toContain('var(--ui-text-primary)');
    expect(lockCss).not.toMatch(/(?:color|background):\s*rgb\((?:255 255 255|0 0 0)\s*\/[^)]*\)/);

    for (const skeleton of skeletons) {
      expect(skeleton).toContain('dashboard-content-surface-soft');
      expect(skeleton).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    }
  });

  it('keeps media and environment cards semantic outside visual content', () => {
    const cameraCss = readSource('src/components/widgets/HaCameraCard.css');
    const mediaCss = readSource('src/components/widgets/HaMediaCard.css');
    const vacuumCss = readSource('src/components/widgets/VacuumCard.css');
    const coverCss = readSource('src/components/widgets/CoverCard.css');
    const weather = readSource('src/components/widgets/WeatherCard.tsx');
    const semanticSkeletons = [
      'src/components/settings/MediaDisplayVariantSkeleton.tsx',
      'src/components/settings/VacuumDisplayVariantSkeleton.tsx',
      'src/components/settings/CoverDisplayVariantSkeleton.tsx',
    ].map(readSource);
    const cameraSkeleton = readSource('src/components/settings/CameraDisplayVariantSkeleton.tsx');

    expect(cameraCss).toContain('background: var(--ui-surface-glass)');
    expect(cameraCss).toContain('color: var(--ui-text-secondary)');
    expect(mediaCss).toContain('--ha-media-text-primary: var(--ui-text-primary)');
    expect(mediaCss).toContain('var(--ui-surface-glass)');
    expect(vacuumCss).toContain('color: var(--ui-text-primary)');
    expect(vacuumCss).toContain('border: 1px solid var(--ui-border)');
    expect(coverCss).toContain('var(--ui-surface-glass)');
    expect(coverCss).toContain('color: var(--ui-text-primary)');
    expect(weather).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);

    for (const skeleton of semanticSkeletons) {
      expect(skeleton).toContain('dashboard-content-surface-soft');
      expect(skeleton).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    }
    expect(cameraSkeleton).toContain('bg-black/25');
  });

  it('keeps supporting cards and micro widgets on semantic structural colors', () => {
    const greeting = readSource('src/components/widgets/GreetingCard.tsx');
    const members = readSource('src/components/widgets/MembersCard.tsx');
    const scenes = readSource('src/components/widgets/ScenesCard.tsx');
    const camera = readSource('src/components/widgets/CameraCard.css');
    const microWidgets = [
      'src/components/widgets/micro/ValuePill.tsx',
      'src/components/widgets/micro/StatusGlow.tsx',
      'src/components/widgets/micro/MiniRing.tsx',
      'src/components/widgets/micro/MicroButton.tsx',
      'src/components/widgets/micro/MicroSlider.tsx',
      'src/components/widgets/micro/MicroStep.tsx',
      'src/components/widgets/micro/MicroSuperChart.tsx',
      'src/components/widgets/micro/MicroToggle.tsx',
    ].map(readSource);

    for (const component of [greeting, members, ...microWidgets]) {
      expect(component).toContain('var(--ui-');
      expect(component).not.toMatch(/(?:text|bg|border)-(?:white|black)(?:\/|\b)/);
    }

    expect(scenes).toContain('var(--ui-text-primary)');
    expect(scenes).toContain('text-white');
    expect(camera).toContain('var(--ui-surface-glass)');
    expect(camera).toContain('camera-card__scrim');
  });

  it('blends the Dynamic glows through registered properties, without blur or motion', () => {
    for (const [name, syntax] of [['--ambient-a', '<color>'], ['--ambient-b', '<color>'], ['--ambient-opacity', '<number>']]) {
      expect(css).toMatch(new RegExp(`@property ${name} \\{\\s*syntax: '${syntax}'`));
    }
    const dynamic = css.slice(css.indexOf('@property --ambient-a'), css.indexOf('.profile-background-thumb-dynamic'));
    expect(dynamic).not.toMatch(/filter:\s*blur|backdrop-filter|transform:(?!\s*none;)/);
    expect(dynamic).toMatch(/--ambient-a 900ms/);
    expect(dynamic).toMatch(/ambient-breath 3s ease-in-out infinite/);
    expect(dynamic).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ambient-glow \{\s*transition: none;[\s\S]*animation: none;/);
    const ceilings = [...dynamic.matchAll(/--ambient-opacity: ([\d.]+);/g)].map((match) => Number(match[1]));
    expect(ceilings).toEqual([0.5, 0.22, 0.38, 0.18]);
  });

  it('does not rely on global Light appearance class-substring corrections', () => {
    expect(css).not.toMatch(/\.dashboard-theme-light\s+\[class\*=/);
  });
});
