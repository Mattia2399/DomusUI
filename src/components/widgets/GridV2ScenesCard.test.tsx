// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GridV2ScenesCard from './GridV2ScenesCard';

afterEach(cleanup);

describe('GridV2ScenesCard', () => {
  it('draws the pills of a room, with the names and icons of the Home', () => {
    const { container } = render(<GridV2ScenesCard scenes={['night', 'movie']} sceneLabels={{ night: 'Buonanotte' }} />);
    expect(container.querySelectorAll('.dv-tile.dv-scene')).toHaveLength(2);
    expect(screen.getByText('Buonanotte')).toBeTruthy();
    expect(screen.getByText('Movie')).toBeTruthy();
    expect(container.querySelector('.dv-scene-mark svg')).not.toBeNull();
  });

  it('runs a scene with a touch, says it is applying, then that it is in place', () => {
    const onSceneTrigger = vi.fn();
    const { container, rerender } = render(<GridV2ScenesCard scenes={['night', 'movie']} onSceneTrigger={onSceneTrigger} />);
    fireEvent.click(screen.getByRole('button', { name: /Night/ }));
    expect(onSceneTrigger).toHaveBeenCalledWith('night');

    rerender(<GridV2ScenesCard scenes={['night', 'movie']} runningSceneId="night" onSceneTrigger={onSceneTrigger} />);
    expect(screen.getByText('Applico…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Night/ }));
    expect(onSceneTrigger).toHaveBeenCalledTimes(1);

    rerender(<GridV2ScenesCard scenes={['night', 'movie']} runningSceneId={null} onSceneTrigger={onSceneTrigger} />);
    expect(screen.getByText('Attiva')).toBeTruthy();
    expect(container.querySelectorAll('.dv-scene[aria-pressed="true"]')).toHaveLength(1);
  });

  it('fills with the colour of the icon instead of turning white, and stays full once in place', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const { container, rerender } = render(<GridV2ScenesCard scenes={['night']} runningSceneId="night" runningSceneStartedAt={Date.now() - 5000} durationScope="fill-a" />);
    const pill = container.querySelector('.dv-scene') as HTMLElement;
    expect(pill.classList.contains('is-on')).toBe(false);
    expect(pill.classList.contains('is-toned')).toBe(true);
    expect(pill.style.getPropertyValue('--dv-scene-tone')).toBe('79 70 229');

    rerender(<GridV2ScenesCard scenes={['night']} runningSceneId={null} durationScope="fill-a" />);
    expect((container.querySelector('.dv-scene-fill') as HTMLElement).style.transform).toBe('scaleX(1.000)');
    vi.restoreAllMocks();
  });

  it('remembers how long a scene really took, to pace the next run', () => {
    window.localStorage.removeItem('ha.dashboard.sceneDurations.v1');
    const startedAt = Date.now() - 8000;
    const { rerender } = render(<GridV2ScenesCard scenes={['night']} runningSceneId="night" runningSceneStartedAt={startedAt} durationScope="section-a" />);
    rerender(<GridV2ScenesCard scenes={['night']} runningSceneId={null} durationScope="section-a" />);
    const stored = JSON.parse(window.localStorage.getItem('ha.dashboard.sceneDurations.v1') ?? '{}');
    expect(stored['section-a:night']).toBeGreaterThanOrEqual(8000);
    expect(stored['section-a:night']).toBeLessThan(10000);
  });

  it('does not read as in place when Home Assistant refused the scene', async () => {
    const onSceneTrigger = vi.fn().mockResolvedValue(false);
    const { container, rerender } = render(<GridV2ScenesCard scenes={['night']} onSceneTrigger={onSceneTrigger} durationScope="section-b" />);
    fireEvent.click(screen.getByRole('button', { name: /Night/ }));
    rerender(<GridV2ScenesCard scenes={['night']} runningSceneId="night" onSceneTrigger={onSceneTrigger} durationScope="section-b" />);
    await Promise.resolve();
    await Promise.resolve();
    rerender(<GridV2ScenesCard scenes={['night']} runningSceneId={null} onSceneTrigger={onSceneTrigger} durationScope="section-b" />);
    expect(screen.queryByText('Attiva')).toBeNull();
    expect((container.querySelector('.dv-scene-fill') as HTMLElement).style.transform).toBe('scaleX(0.000)');
  });

  it('runs nothing while editing, and offers the scenes left to add', () => {
    const onSceneTrigger = vi.fn();
    const onAddScene = vi.fn();
    const { container } = render(<GridV2ScenesCard scenes={['night']} isEditMode onSceneTrigger={onSceneTrigger} onAddScene={onAddScene} />);
    fireEvent.click(screen.getByRole('button', { name: /Night/ }));
    expect(onSceneTrigger).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.dv-scenes-add')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /Movie/ }));
    expect(onAddScene).toHaveBeenCalledWith('movie');
  });
});
