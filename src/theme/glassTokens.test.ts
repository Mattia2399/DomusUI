// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/theme/glassTokens.css'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/assets/index.css'), 'utf8');

const block = (selector: string) => {
  // The last one: the block of a theme alone, not the list of selectors that ends with its name.
  const start = css.lastIndexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
};
const valueOf = (source: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(source)?.[1].trim();

describe('the tokens of the shared controls and of the panel', () => {
  it('has the measures of the note on the panels', () => {
    const root = block(':root');
    const measures: Record<string, string> = {
      '--panel-sheet-height': 'min(90dvh, 720px)',
      '--panel-sheet-radius': '30px',
      '--panel-zone-gap': '18px',
      '--panel-head-control-size': '44px',
      '--panel-name-size': '20px',
      '--panel-name-weight': '700',
      '--panel-status-size': '13px',
      '--panel-hero-width': '148px',
      '--panel-hero-height': '300px',
      '--panel-dialog-slider-width': '128px',
      '--panel-dialog-slider-height': '300px',
      '--control-bar-height': '46px',
      '--control-bar-height-compact': '40px',
      '--control-bar-radius': '16px',
      '--control-pill-height': '44px',
      '--control-pill-height-dialog': '38px',
      '--control-shortcut-size': '48px',
      '--control-shortcut-label-size': '12px',
      '--control-shortcut-label-weight': '600',
      '--control-hit-min': '44px',
    };
    Object.entries(measures).forEach(([name, value]) => expect(valueOf(root, name), name).toBe(value));
  });

  it('gives meaning to colours through the app tokens, so that every theme reaches them', () => {
    const root = css;
    expect(valueOf(root, '--state-ok')).toBe('var(--ui-success)');
    expect(valueOf(root, '--state-warning')).toBe('var(--ui-warning)');
    expect(valueOf(root, '--state-error')).toBe('var(--ui-danger)');
    expect(valueOf(root, '--state-info')).toBe('var(--ui-info)');
    ['--ui-success', '--ui-warning', '--ui-danger', '--ui-danger-contrast', '--ui-info', '--ui-segment-on', '--ui-segment-on-ink', '--ui-accent-rgb', '--ui-sheet-surface', '--ui-focus-ring'].forEach(
      (name) => expect(app, name).toContain(`${name}:`),
    );
  });

  it('declares what refers to the app tokens again on each theme, where it gets resolved', () => {
    expect(css).toMatch(/:root,\s*\.dashboard-theme-dark,\s*\.dashboard-theme-light \{[^}]*--state-ok: var\(--ui-success\)/);
  });

  it('keeps the colour of the device apart, with a value for a panel that gives none', () => {
    const root = css;
    ['--device-accent', '--device-accent-ink', '--device-accent-rgb'].forEach((name) => expect(valueOf(root, name), name).toMatch(/^var\(--ui-accent/));
  });

  it('defines what depends on the theme in both themes', () => {
    const dark = block('.dashboard-theme-dark');
    const light = block('.dashboard-theme-light');
    ['--state-off', '--state-off-ink', '--control-track', '--control-fill-neutral', '--control-soft', '--control-soft-strong', '--control-knob', '--control-ring', '--surface-tint-alpha'].forEach((name) => {
      expect(valueOf(dark, name), `dark ${name}`).toBeTruthy();
      expect(valueOf(light, name), `light ${name}`).toBeTruthy();
    });
  });

  it('is loaded once, with the first page, so that the small pages do not each carry it', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(main).toContain("import './theme/glassTokens.css';");
  });

  it('leaves the column of the Home neutral', () => {
    expect(valueOf(css, '--surface-column')).not.toContain('device-accent');
  });
});

describe('the colours of the functions', () => {
  const FUNCTIONS = ['security', 'irrigation', 'climate', 'energy', 'waste'] as const;
  // The approved table: light / dark.
  const APPROVED: Record<(typeof FUNCTIONS)[number] | 'app-glow', [string, string]> = {
    security: ['#1f9d55', '#30d158'],
    irrigation: ['#0e9f6e', '#34d399'],
    climate: ['#e8590c', '#ff8a4c'],
    energy: ['#b7791f', '#ffc53d'],
    waste: ['#2f855a', '#4ade80'],
    'app-glow': ['#8e44d9', '#a66bff'],
  };

  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  it('has the approved value in each theme', () => {
    const light = block('.dashboard-theme-light');
    const dark = block('.dashboard-theme-dark');
    Object.entries(APPROVED).forEach(([name, [lightValue, darkValue]]) => {
      expect(valueOf(light, `--fn-${name}`), `light ${name}`).toBe(lightValue);
      expect(valueOf(dark, `--fn-${name}`), `dark ${name}`).toBe(darkValue);
    });
  });

  it('keeps the blue of the app on the app accent', () => {
    expect(valueOf(css, '--fn-app')).toBe('var(--ui-accent)');
    expect(valueOf(css, '--fn-app-ink')).toBe('var(--ui-accent-contrast)');
  });

  it('draws in white on a filled colour, in both themes, as the prototypes do', () => {
    expect(valueOf(css, '--fn-on-fill')).toBe('#ffffff');
  });

  it('puts an ink on each colour that an icon on it can be read with (WCAG 1.4.11, 3:1)', () => {
    (['.dashboard-theme-light', '.dashboard-theme-dark'] as const).forEach((theme) => {
      const values = block(theme);
      FUNCTIONS.forEach((name) => {
        const fill = valueOf(values, `--fn-${name}`)!;
        const ink = valueOf(values, `--fn-${name}-ink`)!;
        expect(contrast(fill, ink), `${theme} ${name}`).toBeGreaterThanOrEqual(3);
      });
    });
  });

  it('resolves what refers to them again on each theme', () => {
    expect(css).toMatch(/:root,\s*\.dashboard-theme-dark,\s*\.dashboard-theme-light \{[^}]*--fn-security-soft: color-mix\(in srgb, var\(--fn-security\) 16%, transparent\)/);
    expect(css).toMatch(/:root,\s*\.dashboard-theme-dark,\s*\.dashboard-theme-light \{[^}]*--fn-accent: var\(--fn-app\)/);
  });

  it('gives each function page its colour once, through data-fn', () => {
    FUNCTIONS.forEach((name) => {
      const start = css.indexOf(`[data-fn='${name}'] {`);
      expect(start, name).toBeGreaterThan(-1);
      const rule = css.slice(start, css.indexOf('}', start));
      expect(valueOf(rule, '--fn-accent'), name).toBe(`var(--fn-${name})`);
      expect(valueOf(rule, '--fn-accent-ink'), name).toBe(`var(--fn-${name}-ink)`);
      expect(valueOf(rule, '--fn-accent-soft'), name).toBe(`var(--fn-${name}-soft)`);
    });
  });

  it('leaves the colours of Rooms as they are', () => {
    const rooms = readFileSync(resolve(process.cwd(), 'src/pages/rooms/rooms.css'), 'utf8');
    expect(valueOf(rooms, '--rooms-security')).toBe('#ff9f0a');
    expect(css).not.toContain('--rooms-');
  });
});
