import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toMediaModel } from '../model/media';
import { homeLiveEntityId } from '../../settings/homePanelRoute';
import { MediaPlayer, type MediaGroupCandidate } from './MediaPlayer';

afterEach(cleanup);

const ALL = 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 2048 | 16384 | 32768 | 65536 | 262144 | 524288;

const model = (state: string, attributes: Record<string, unknown> = {}) =>
  toMediaModel('media_player.casa', { state, rawAttributes: { friendly_name: 'Casa', supported_features: ALL, volume_level: 0.6, ...attributes } } as never);

const playing = () =>
  model('playing', { media_title: 'Strade di sera', media_artist: 'Ninfea', source: 'Spotify', source_list: ['Spotify', 'Radio'], sound_mode: 'Film', sound_mode_list: ['Musica', 'Film'], group_members: ['media_player.casa'] });

const candidates: MediaGroupCandidate[] = [{ entityId: 'media_player.tv', name: 'TV Soggiorno', roomName: 'Soggiorno' }];

function draw(over: Partial<Parameters<typeof MediaPlayer>[0]> = {}) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(<MediaPlayer model={playing()} pictureUrl={null} groupCandidates={candidates} onAction={onAction} onClose={onClose} {...over} />);
  return { onAction, onClose };
}

const row = () => within(screen.getByRole('group', { name: 'Controlli' }));

describe('the player', () => {
  it('has the volume, and a touch on its icon takes the sound away', () => {
    const { onAction } = draw();
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('60');
    fireEvent.click(screen.getByRole('button', { name: 'Togli l’audio' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'mute', muted: true });
  });

  it('has its power at the top right, and turns off without closing', () => {
    const { onAction, onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni Casa' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'power', on: false });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers in its row only what the player has', () => {
    draw();
    expect(row().getByRole('button', { name: 'Casse' })).toBeTruthy();
    expect(row().getByRole('button', { name: 'Sorgente' })).toBeTruthy();
    expect(row().getByRole('button', { name: 'Audio' })).toBeTruthy();
    expect(row().queryByRole('button', { name: 'Timer' })).toBeNull();
    cleanup();
    draw({ model: model('playing', { media_title: 'Solo', supported_features: 1 }), groupCandidates: [] });
    expect(screen.queryByRole('group', { name: 'Controlli' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Volume' })).toBeNull();
  });

  it('opens the speakers from where it plays, and joins another one', () => {
    const { onAction } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /TV Soggiorno/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'group', member: 'media_player.tv', joined: true });
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.queryByRole('checkbox', { name: /TV Soggiorno/ })).toBeNull();
  });

  it('says how many more play with it', () => {
    draw({ model: { ...playing(), groupMembers: ['media_player.casa', 'media_player.tv'] } });
    expect(screen.getByText('Casa + 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Casa + 1' }));
    expect(screen.getByRole('checkbox', { name: /TV Soggiorno/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('chooses the source and the sound among what it lists', () => {
    const { onAction } = draw();
    fireEvent.click(row().getByRole('button', { name: 'Sorgente' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Radio' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'source', source: 'Radio' });
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    fireEvent.click(row().getByRole('button', { name: 'Audio' }));
    expect(screen.getByRole('radio', { name: 'Film' }).getAttribute('aria-checked')).toBe('true');
  });

  it('says it is off, without a row to choose from, and turns on from the power', () => {
    const { onAction } = draw({ model: model('off') });
    expect(screen.getByRole('heading', { name: 'Spento' })).toBeTruthy();
    expect(screen.getByText('Il lettore è spento')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Controlli' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accendi Casa' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'power', on: true });
  });

  it('with nothing playing says what to do, and keeps the way to do it', () => {
    draw({ model: model('idle', { source_list: ['Spotify'] }) });
    expect(screen.getByRole('heading', { name: 'Nessuna riproduzione' })).toBeTruthy();
    expect(screen.getByText('Scegli cosa ascoltare da Sorgente')).toBeTruthy();
    expect(row().getByRole('button', { name: 'Sorgente' })).toBeTruthy();
  });

  it('without a cover keeps its place, and a broken one gives way to it', () => {
    const { container } = render(<MediaPlayer model={playing()} pictureUrl="https://example.test/cover.jpg" groupCandidates={[]} onAction={vi.fn()} onClose={vi.fn()} />);
    const cover = container.querySelector('.panel-media-cover img');
    expect(cover).toBeTruthy();
    fireEvent.error(cover as Element);
    expect(container.querySelector('.panel-media-cover img')).toBeNull();
    expect(container.querySelector('.panel-media-nocover')).toBeTruthy();
  });
});

describe('the player of a card in the Home', () => {
  it('is the one the card shows, even when another has the same name', () => {
    const states = {
      'media_player.first': { state: 'playing', rawAttributes: { friendly_name: 'Sala' } },
      'media_player.second': { state: 'paused', rawAttributes: { friendly_name: 'Sala' } },
    };
    const props = { activeDevice: { id: 'widget-1', name: 'Sala', type: 'media', mediaEntityId: 'media_player.second' }, haStates: states, lock: {}, speaker: {} } as never;
    expect(homeLiveEntityId(props, 'media_player')).toBe('media_player.second');
  });
});
