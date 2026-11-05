import type React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relatedWordsOf } from '../../../../i18n/relatedTranslations';
import type { RelatedControl } from '../../../../types/relatedControl';
import { RelatedControlView } from './RelatedControlView';
import { RELATED_FAMILY_LOADERS } from './relatedLooks';
import { relatedModelOf } from './relatedModel';
import type { RelatedActs } from './relatedLookTypes';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const words = relatedWordsOf('it');
const acts = (): RelatedActs => ({ setOn: vi.fn(), press: vi.fn(), hold: vi.fn(), setNumber: vi.fn(), setOption: vi.fn(), setText: vi.fn(), setDateTime: vi.fn(), go: vi.fn(), toggleTimer: vi.fn() });

function view(control: Partial<RelatedControl> & Pick<RelatedControl, 'look' | 'entityId'>, state: Parameters<typeof relatedModelOf>[1], form: 'compact' | 'group' | 'hero' = 'group', actions = acts()) {
  const full = { id: 'x', place: 'more', order: 0, ...control } as RelatedControl;
  render(<RelatedControlView control={full} model={relatedModelOf(full.entityId, state, full.name)} form={form} acts={actions} history={[]} locale="it-IT" words={words} />);
  return actions;
}

const POWER = { state: '3', rawAttributes: { friendly_name: 'Potenza', min: 1, max: 5, step: 1 } };

describe('what stands in its place', () => {
  it('an entity that is gone says so and does not vanish', () => {
    view({ look: 'levels', entityId: 'number.gone' }, undefined);
    expect(screen.getByTestId('related-unavailable').textContent).toContain('Non disponibile');
  });

  it('an entity that does not answer says so too', () => {
    view({ look: 'temperature', entityId: 'sensor.a' }, { state: 'unavailable' });
    expect(screen.getByTestId('related-unavailable')).toBeTruthy();
  });

  it('a page button stands without any entity', async () => {
    view({ look: 'page', entityId: '', name: 'Stanze', options: { path: '/rooms' } }, undefined);
    expect(await screen.findByRole('button', { name: 'Stanze' })).toBeTruthy();
  });

  it('keeps the height of the look while its piece arrives', async () => {
    let arrive: (module: { default: () => React.ReactElement }) => void = () => undefined;
    vi.spyOn(RELATED_FAMILY_LOADERS, 'values').mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    view({ look: 'levels', entityId: 'number.a' }, POWER);
    const waiting = screen.getByTestId('related-placeholder');
    expect(waiting.style.minHeight).toBe('46px');
    arrive({ default: () => <span>arrivato</span> });
    const shown = await screen.findByText('arrivato');
    expect(screen.queryByTestId('related-placeholder')).toBeNull();
    expect(shown.parentElement?.style.minHeight).toBe('46px');
  });

  it('says it failed and tries again', async () => {
    const load = vi.spyOn(RELATED_FAMILY_LOADERS, 'values').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => <span>arrivato</span> });
    view({ look: 'levels', entityId: 'number.a' }, POWER);
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('arrivato')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a look of the base family asks for no piece of the others', async () => {
    const others = (['values', 'actions', 'indicators', 'charts', 'text', 'advanced'] as const).map((family) => vi.spyOn(RELATED_FAMILY_LOADERS, family));
    view({ look: 'toggle-row', entityId: 'switch.a' }, { state: 'on', rawAttributes: { friendly_name: 'Programma' } });
    expect(await screen.findByRole('switch', { name: /Programma/ })).toBeTruthy();
    others.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

describe('it draws the look with the values of the entity', () => {
  it('levels, and touching one sends it', async () => {
    const actions = view({ look: 'levels', entityId: 'number.a' }, POWER);
    fireEvent.click(await screen.findByRole('radio', { name: '5' }));
    expect(actions.setNumber).toHaveBeenCalledWith(5);
    expect(screen.getByRole('radio', { name: '3' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a choice', async () => {
    const actions = view({ look: 'list', entityId: 'select.a' }, { state: 'eco', rawAttributes: { friendly_name: 'Profilo', options: ['eco', 'boost'] } });
    fireEvent.click(await screen.findByRole('radio', { name: 'boost' }));
    expect(actions.setOption).toHaveBeenCalledWith('boost');
  });

  it('a switch', async () => {
    const actions = view({ look: 'toggle-row', entityId: 'switch.a' }, { state: 'on', rawAttributes: { friendly_name: 'Programma' } });
    fireEvent.click(await screen.findByRole('switch', { name: /Programma/ }));
    expect(actions.setOn).toHaveBeenCalledWith(false);
  });

  it('press and hold: on while held, off when let go', async () => {
    const actions = view({ look: 'momentary', entityId: 'switch.a', name: 'Campanello' }, { state: 'off' }, 'hero');
    fireEvent.pointerDown(await screen.findByRole('button', { name: /Campanello/ }));
    expect(actions.hold).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(window);
    expect(actions.hold).toHaveBeenLastCalledWith(false);
  });

  it('a page button goes to its page', async () => {
    const actions = view({ look: 'page', entityId: '', name: 'Stanze', options: { path: '/rooms' } }, undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'Stanze' }));
    expect(actions.go).toHaveBeenCalledTimes(1);
  });

  it('a reading says its value', async () => {
    view({ look: 'temperature', entityId: 'sensor.a' }, { state: '56.4', unit: '°C', rawAttributes: { device_class: 'temperature' } });
    expect(await screen.findByText('56,4')).toBeTruthy();
  });

  it('a chart without history says so', async () => {
    view({ look: 'chart-line', entityId: 'sensor.a' }, { state: '5' });
    expect(await screen.findByText('Nessun dato')).toBeTruthy();
  });

  it('a timer counts from where it stands', async () => {
    view({ look: 'countdown', entityId: 'timer.a', name: 'Pasta' }, { state: 'paused', rawAttributes: { remaining: '0:04:06', duration: '0:10:00' } });
    expect(await screen.findByText('4:06')).toBeTruthy();
    expect(screen.getByText('In pausa')).toBeTruthy();
  });

  it.each(['compact', 'group', 'hero'] as const)('in the form %s', async (form) => {
    view({ look: 'levels', entityId: 'number.a' }, POWER, form);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(document.querySelector(`.related-look.is-${form} .glass-levels.is-${form}`)).toBeTruthy());
  });
});
