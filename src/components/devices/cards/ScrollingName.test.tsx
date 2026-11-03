import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollingName } from './ScrollingName';

const rect = (width: number) => ({ width, height: 18, top: 0, left: 0, right: width, bottom: 18, x: 0, y: 0, toJSON: () => ({}) });

/** The box has room for `room` px and the name needs `needed`. */
function measureAs(room: number, needed: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: HTMLElement) {
    return rect(this.classList.contains('dv-name-scroll') ? room : needed);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the scrolling name of a card', () => {
  it('stays still when it fits, with nothing doubled', () => {
    measureAs(120, 80);
    const { container } = render(<ScrollingName name="Faretti" />);
    expect(container.querySelector('.is-moving')).toBeNull();
    expect(screen.getAllByText('Faretti')).toHaveLength(1);
  });

  it('scrolls when it does not fit, and the copy is for the eyes only', () => {
    measureAs(120, 300);
    const { container } = render(<ScrollingName name="Lampada del soggiorno grande" />);
    expect(container.querySelector('.dv-name-scroll.is-moving')).toBeTruthy();
    const copies = screen.getAllByText('Lampada del soggiorno grande');
    expect(copies).toHaveLength(2);
    expect(copies.filter((copy) => copy.getAttribute('aria-hidden') === 'true')).toHaveLength(1);
  });

  it('takes longer for a longer name', () => {
    const timeOf = (needed: number) => {
      measureAs(120, needed);
      const { container } = render(<ScrollingName name="Nome" />);
      const time = (container.firstElementChild as HTMLElement).style.getPropertyValue('--dv-name-time');
      cleanup();
      return Number.parseFloat(time);
    };
    expect(timeOf(600)).toBeGreaterThan(timeOf(300));
  });

  it('stays still while the page is being edited', () => {
    measureAs(120, 300);
    const { container } = render(<ScrollingName name="Lampada del soggiorno grande" still />);
    expect(container.querySelector('.is-moving')).toBeNull();
    expect(container.querySelector('.is-long')).toBeTruthy();
    expect(screen.getAllByText('Lampada del soggiorno grande')).toHaveLength(1);
  });
});
