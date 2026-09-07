import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('global accessibility contract', () => {
  it('declares the Italian language and adaptive browser colors', () => {
    const html = read('index.html');

    expect(html).toContain('<html lang="it">');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain('media="(prefers-color-scheme: light)"');
    expect(html).toContain('media="(prefers-color-scheme: dark)"');
  });

  it('honors the operating system reduced-motion preference globally', () => {
    const main = read('src/main.tsx');
    const css = read('src/assets/index.css');

    expect(main).toContain('<MotionConfig reducedMotion="user">');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-duration: 0.01ms !important');
    expect(css).toContain('transition-duration: 0.01ms !important');
  });

  it('provides a keyboard skip link and a matching focus target', () => {
    const board = read('src/components/dashboard/MainBoard.tsx');
    const css = read('src/assets/index.css');

    expect(board).toContain('href="#dashboard-main-content"');
    expect(board).toContain('id="dashboard-main-content"');
    expect(css).toContain('.dashboard-skip-link');
  });

  it('keeps keyboard layout editing discoverable on canvas and stack', () => {
    const canvas = read('src/components/dashboard/GridCanvas.tsx');
    const stack = read('src/components/dashboard/StackGrid.tsx');

    expect(canvas).toContain('handleCanvasItemKeyDown');
    expect(canvas).toContain("t('home.catalog.keyboardHelp')");
    expect(stack).toContain('handleStackItemKeyDown');
    expect(stack).toContain('role="status"');
  });
});
