import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelFitList } from './fitList';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('rows in the space of a protagonist', () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map((name) => <p key={name}>{name}</p>);

  it('shows them all when nothing measures, or when they fit', () => {
    render(<PanelFitList rows={rows} moreLabel={(count) => `Altri ${count}`} onMore={vi.fn()} />);
    expect(screen.getByText('E')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows those that fit and how many are left, which opens the page', () => {
    let measure = () => undefined as void;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { measure = callback; }
      observe() {}
      disconnect() {}
    });
    const onMore = vi.fn();
    const { container } = render(<PanelFitList rows={rows} moreLabel={(count) => `Altri ${count}`} onMore={onMore} />);
    const box = container.querySelector<HTMLElement>('.panel-fit-list')!;
    Object.defineProperty(box, 'clientHeight', { value: 150 });
    Object.defineProperty(box.firstElementChild, 'offsetHeight', { value: 50 });
    act(() => measure());
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.queryByText('C')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Altri 3' }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });
});
