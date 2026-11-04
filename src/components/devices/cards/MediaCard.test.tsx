// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toMediaModel } from '../model/media';
import { MediaCard } from './MediaCard';

afterEach(cleanup);

const playing = toMediaModel('media_player.living', {
  state: 'playing',
  rawAttributes: {
    friendly_name: 'Soggiorno',
    media_title: 'Blue in Green',
    media_artist: 'Miles Davis',
    media_duration: 337,
    media_position: 60,
    media_position_updated_at: new Date().toISOString(),
    volume_level: 0.4,
    supported_features: 0xffffff,
  },
});
const off = toMediaModel('media_player.living', {
  state: 'off',
  rawAttributes: { friendly_name: 'Soggiorno', supported_features: 0xffffff },
});

describe('MediaCard on the Home grid', () => {
  it('stays the plain tile at U×2, also while it plays, and its icon plays or pauses', () => {
    const onAction = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(<MediaCard model={playing} pictureUrl={null} format="U×2" onAction={onAction} onOpen={onOpen} />);
    expect(container.querySelector('.dv-np-format')).toBeNull();
    expect(screen.getByText('Blue in Green')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Metti in pausa' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'play_pause' });
  });

  it('shows the position and controls in Standard, the artwork too in Expanded, and the volume in neither', () => {
    const shapes = { 'U×4': false, 'W×4': true } as const;
    for (const [format, full] of Object.entries(shapes)) {
      const { container, unmount } = render(
        <MediaCard model={playing} pictureUrl={null} format={format as keyof typeof shapes} onAction={vi.fn()} onOpen={vi.fn()} />,
      );
      expect(container.querySelector('[data-testid="media-card"]')?.getAttribute('data-format'), format).toBe(format);
      expect(screen.getByRole('button', { name: 'Successivo' }), format).toBeTruthy();
      expect(screen.queryByRole('slider', { name: 'Volume' }), format).toBeNull();
      expect(Boolean(container.querySelector('.dv-media-art.is-large')), format).toBe(full);
      unmount();
    }
  });

  it('switches a player that is off on from its icon, whatever the format', () => {
    const onAction = vi.fn();
    const { container } = render(<MediaCard model={off} pictureUrl={null} format="W×4" onAction={onAction} onOpen={vi.fn()} />);
    expect(container.querySelector('.dv-np-format')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accendi Soggiorno' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'power', on: true });
  });
});
