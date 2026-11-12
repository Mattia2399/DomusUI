import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowIcon } from './glassIcons';

afterEach(cleanup);

describe('WindowIcon', () => {
  it('is the window of the prototype: an upright rounded rectangle with its cross', () => {
    const { container } = render(<WindowIcon size={18} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('18');
    const rect = svg.querySelector('rect')!;
    expect([rect.getAttribute('width'), rect.getAttribute('height'), rect.getAttribute('rx')]).toEqual(['16', '18', '2']);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M12 3v18M4 12h16');
  });
});
