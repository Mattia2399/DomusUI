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
      '--panel-icon-size': '48px',
      '--panel-name-size': '20px',
      '--panel-name-weight': '700',
      '--panel-status-size': '13px',
      '--panel-hero-width': '148px',
      '--panel-hero-height': '300px',
      '--panel-controls-height': '148px',
      '--panel-footer-height': '68px',
      '--panel-power-size': '64px',
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
