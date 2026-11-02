// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SecurityModel } from '../model/security';
import { SecurityCard } from './SecurityCard';

afterEach(cleanup);

const door: SecurityModel = {
  entityId: 'lock.front_door',
  name: 'Porta di casa',
  kind: 'lock',
  available: true,
  active: false,
  lock: 'locked',
  canOpen: true,
  changedAt: null,
  battery: 80,
};

const garden: SecurityModel = {
  entityId: 'camera.garden',
  name: 'Giardino',
  kind: 'camera',
  available: true,
  active: false,
  lock: null,
  canOpen: false,
  changedAt: null,
  battery: null,
};

describe('SecurityCard on the Home grid', () => {
  it('keeps the row of a room, with the small ring, when no format is given', () => {
    const { container } = render(<SecurityCard model={door} onOpen={vi.fn()} />);
    expect(container.querySelector('.dv-ring')).not.toBeNull();
    expect(container.querySelector('.dv-ring-lg')).toBeNull();
    expect(container.querySelector('.dv-security-tall')).toBeNull();
  });

  it('shows the large ring of a lock in Expanded, the small one beside its state in Standard and the Mini', () => {
    const wide = render(<SecurityCard model={door} format="W×4" onOpen={vi.fn()} />);
    expect(wide.container.querySelector('.dv-ring-lg')).not.toBeNull();
    wide.unmount();
    for (const format of ['U×2', 'U×4'] as const) {
      const card = render(<SecurityCard model={door} format={format} onOpen={vi.fn()} />);
      expect(card.container.querySelector('.dv-ring-lg'), format).toBeNull();
      expect(card.container.querySelector('.dv-ring'), format).not.toBeNull();
      card.unmount();
    }
  });

  it('fills Standard and Expanded with the camera picture, and keeps a round preview in the Mini', () => {
    for (const format of ['U×4', 'W×4'] as const) {
      const { container, unmount } = render(
        <SecurityCard model={garden} format={format} pictureUrl="/snapshot.jpg" onOpen={vi.fn()} />,
      );
      expect(container.querySelector('.dv-camera-full .dv-camera-picture img')?.getAttribute('src'), format).toBe('/snapshot.jpg');
      unmount();
    }
    const small = render(<SecurityCard model={garden} format="U×2" pictureUrl="/snapshot.jpg" onOpen={vi.fn()} />);
    expect(small.container.querySelector('.dv-camera-round img')).not.toBeNull();
  });

  it('opens the live view, or selects while editing', () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    const live = render(<SecurityCard model={garden} format="W×4" onOpen={onOpen} />);
    fireEvent.click(live.container.querySelector('.dv-tile-body')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    live.unmount();
    const editing = render(<SecurityCard model={garden} format="W×4" editing onOpen={onOpen} onSelect={onSelect} />);
    fireEvent.click(editing.container.querySelector('.dv-tile-body')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
