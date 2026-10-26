// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildSectionPreview,
  groupSectionPage,
  pinRanks,
  sortBySectionRule,
  togglePinned,
  type SectionItem,
} from './sectionRules';

const item = (id: string, patch: Partial<SectionItem> = {}): SectionItem => ({
  id,
  name: id,
  pinRank: null,
  needsAttention: false,
  active: false,
  hidden: false,
  ...patch,
});

describe('the order of a section', () => {
  it('puts the ones in evidence first in their order, then the ones to check, the ones on, then by name', () => {
    const sorted = sortBySectionRule([
      item('Zeta'),
      item('Alfa'),
      item('Accesa', { active: true }),
      item('Guasta', { needsAttention: true }),
      item('Seconda', { pinRank: 2 }),
      item('Prima', { pinRank: 1, active: false }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['Prima', 'Seconda', 'Guasta', 'Accesa', 'Alfa', 'Zeta']);
  });

  it('orders names without caring for case or accents', () => {
    expect(sortBySectionRule([item('bagno'), item('Ápice'), item('Cucina')]).map((entry) => entry.id)).toEqual(['Ápice', 'bagno', 'Cucina']);
  });
});

describe('the preview in the room', () => {
  it('shows up to four', () => {
    const preview = buildSectionPreview(['a', 'b', 'c', 'd'].map((id) => item(id)));
    expect(preview.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(preview.more).toBe(0);
  });

  it('with more, shows three and a card for the rest', () => {
    const preview = buildSectionPreview(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id)));
    expect(preview.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(preview.more).toBe(3);
  });

  it('never shows a hidden device, even in evidence', () => {
    const preview = buildSectionPreview([
      item('a', { hidden: true, pinRank: 1 }),
      item('b'),
      item('c', { hidden: true }),
      item('d'),
      item('e'),
      item('f'),
    ]);
    expect(preview.items.map((entry) => entry.id)).toEqual(['b', 'd', 'e', 'f']);
    expect(preview.more).toBe(0);
    expect(preview.hiddenCount).toBe(2);
    expect(buildSectionPreview([item('a', { hidden: true })]).allHidden).toBe(true);
  });
});

describe('the section page', () => {
  it('groups in evidence, others and hidden, and searches by name', () => {
    const items = [item('Lampada', { pinRank: 1 }), item('Faretti'), item('Striscia', { hidden: true }), item('Lampadario')];
    const groups = groupSectionPage(items);
    expect(groups.pinned.map((entry) => entry.id)).toEqual(['Lampada']);
    expect(groups.others.map((entry) => entry.id)).toEqual(['Faretti', 'Lampadario']);
    expect(groups.hidden.map((entry) => entry.id)).toEqual(['Striscia']);
    const found = groupSectionPage(items, ' lamp');
    expect([...found.pinned, ...found.others].map((entry) => entry.id)).toEqual(['Lampada', 'Lampadario']);
  });

  it('pins the selection at the end, and unpins it when it is all pinned', () => {
    expect(togglePinned(['a'], ['c', 'b'])).toEqual(['a', 'c', 'b']);
    expect(togglePinned(['a', 'c', 'b'], ['a', 'b'])).toEqual(['c']);
    expect(togglePinned(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(pinRanks(['c', 'a']).get('a')).toBe(2);
  });
});
