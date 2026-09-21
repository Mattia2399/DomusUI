import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lightCss = readFileSync(resolve(process.cwd(), 'src/components/widgets/LightCard.css'), 'utf8');
const lightView = readFileSync(resolve(process.cwd(), 'src/components/widgets/LightCardView.tsx'), 'utf8');

describe('LightCard container contract', () => {
  it('owns its visual layout through size container queries', () => {
    expect(lightCss).toContain('container-name: light-card');
    expect(lightCss).toContain('container-type: size');
    expect(lightCss).toContain('@container light-card (min-width: 132px) and (min-height: 44px)');
    expect(lightCss).toContain('@container light-card (min-width: 88px) and (min-height: 96px)');
    expect(lightCss).toContain('@container light-card (min-width: 170px) and (min-height: 104px)');
    expect(lightCss).toContain('@container light-card (min-width: 320px) and (min-height: 104px)');
    expect(lightCss).toContain('@container light-card (min-width: 176px) and (min-height: 160px)');
    expect(lightCss).not.toContain('@media');
  });

  it('keeps state and feature attributes without a JS-owned visual variant', () => {
    expect(lightCss).not.toContain('data-light-variant');
    expect(lightView).not.toContain('data-light-variant');
    expect(lightView).toContain('data-light-state');
    expect(lightView).toContain('data-light-mode');
    expect(lightView).toContain('data-light-has-details');
    expect(lightView).toContain('data-light-has-slider');
    expect(lightView).not.toContain('displayVariant');
  });
});
