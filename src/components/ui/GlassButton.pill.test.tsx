import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GlassButton } from './GlassButton';

afterEach(cleanup);

describe('GlassButton, the pill of the main command', () => {
  it('is a pill of 52 px, or 44 px when compact', () => {
    render(
      <>
        <GlassButton variant="pill">Inserisci</GlassButton>
        <GlassButton variant="pill" size="compact">
          Avvia
        </GlassButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Inserisci' }).className).toContain('glass-btn-pill');
    const compact = screen.getByRole('button', { name: 'Avvia' });
    expect(compact.className).toContain('glass-btn-pill');
    expect(compact.className).toContain('glass-btn-compact');
  });

  it('takes the colour of the function and its shadow, with white text', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), 'src/components/ui/glassButton.css'), 'utf8');
    const rule = css.slice(css.indexOf('.glass-btn-pill {'), css.indexOf('}', css.indexOf('.glass-btn-pill {')));
    expect(rule).toContain('height: 52px');
    expect(rule).toContain('border-radius: 999px');
    expect(rule).toContain('background: var(--fn-accent)');
    expect(rule).toContain('box-shadow: 0 14px 30px -16px var(--fn-accent)');
    expect(rule).toContain('color: var(--fn-on-fill)');
  });
});
