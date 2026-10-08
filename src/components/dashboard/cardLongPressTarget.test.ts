// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isCardContextLongPressBlockedTarget } from './cardLongPressTarget';

describe('isCardContextLongPressBlockedTarget', () => {
  it('allows ordinary card surfaces', () => {
    const surface = document.createElement('div');

    expect(isCardContextLongPressBlockedTarget(surface)).toBe(false);
  });

  it('blocks operational controls', () => {
    const button = document.createElement('button');
    const slider = document.createElement('input');
    slider.type = 'range';

    expect(isCardContextLongPressBlockedTarget(button)).toBe(true);
    expect(isCardContextLongPressBlockedTarget(slider)).toBe(true);
  });

  it('allows an opted-in primary card action and its descendants', () => {
    const button = document.createElement('button');
    button.dataset.cardContextLongPress = 'true';
    const label = document.createElement('span');
    button.append(label);

    expect(isCardContextLongPressBlockedTarget(button)).toBe(false);
    expect(isCardContextLongPressBlockedTarget(label)).toBe(false);
  });
});
