import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COVER_CARD_CAPABILITY, FAN_CARD_CAPABILITY, HUMIDIFIER_CARD_CAPABILITY } from './cardCapabilityRegistry';

const source = (file: string) => readFileSync(resolve(process.cwd(), `src/components/widgets/${file}`), 'utf8');

const cards = [
  { name: 'cover', css: 'CoverCard.css', view: 'CoverCardView.tsx', owner: 'CoverCard.tsx', capability: COVER_CARD_CAPABILITY,
    compactWide: [132, 72], compactTall: [88, 112], standard: [170, 148], fullWide: [300, 235], fullTall: [176, 250] },
  { name: 'fan', css: 'FanCard.css', view: 'FanCard.tsx', owner: 'FanCard.tsx', capability: FAN_CARD_CAPABILITY,
    compactWide: [132, 48], compactTall: [92, 110], standard: [180, 108], fullWide: [310, 240], fullTall: [190, 290] },
  { name: 'humidifier', css: 'HumidifierCard.css', view: 'HumidifierCard.tsx', owner: 'HumidifierCard.tsx', capability: HUMIDIFIER_CARD_CAPABILITY,
    compactWide: [132, 48], compactTall: [92, 110], standard: [180, 108], fullWide: [300, 225], fullTall: [190, 250] },
] as const;

describe.each(cards)('$name adaptive card contract', (card) => {
  it('uses named size container queries and no JS visual variant', () => {
    const css = source(card.css);
    const view = source(card.view);
    const owner = source(card.owner);
    expect(css).toContain(`container-name: ${card.name}-card`);
    expect(css).toContain('container-type: size');
    for (const [width, height] of [card.compactWide, card.compactTall, card.standard, card.fullWide, card.fullTall]) {
      expect(css).toContain(`@container ${card.name}-card (min-width: ${width}px) and (min-height: ${height}px)`);
    }
    expect(css).not.toContain(`data-${card.name}-variant`);
    expect(view).not.toContain(`data-${card.name}-variant`);
    expect(owner).not.toMatch(/variant\s*[!=]==?\s*['"](mini|compact|standard|full)['"]/);
    expect(view).toContain(`data-${card.name}-state`);
  });

  it('keeps Builder pixel variants aligned at both wide and tall boundaries', () => {
    const variant = (width: number, height: number) => card.capability.resolvePixelDisplayVariant({ width, height });
    expect(variant(card.compactWide[0] - 1, card.compactWide[1])).toBe('mini');
    expect(variant(card.compactWide[0], card.compactWide[1])).toBe('compact');
    expect(variant(card.compactTall[0], card.compactTall[1])).toBe('compact');
    expect(variant(card.standard[0] - 1, card.standard[1])).toBe('compact');
    expect(variant(card.standard[0], card.standard[1])).toBe('standard');
    expect(variant(card.fullWide[0], card.fullWide[1] - 1)).toBe('standard');
    expect(variant(card.fullWide[0], card.fullWide[1])).toBe('full');
    expect(variant(card.fullTall[0], card.fullTall[1] - 1)).toBe('standard');
    expect(variant(card.fullTall[0], card.fullTall[1])).toBe('full');
  });
});
