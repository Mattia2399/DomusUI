import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../../i18n/I18nProvider';
import type { LightModel } from '../model/light';
import { LightPanel, type LightPanelProps } from './LightPanel';

const model = (over: Partial<LightModel> = {}) =>
  ({
    entityId: 'light.sala',
    name: 'Faretti',
    on: true,
    available: true,
    caps: 'color',
    mode: 'color',
    brightnessPct: 60,
    hue: 30,
    kelvin: 3000,
    ...over,
  }) as LightModel;

function panel(props: Partial<LightPanelProps> = {}) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(
    <I18nProvider>
      <LightPanel model={model()} onAction={vi.fn()} onClose={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

const shortcuts = () => within(screen.getByRole('group', { name: 'Regolazioni' })).queryAllByRole('button').map((button) => button.textContent);

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('the light panel within reach of a thumb', () => {
  it('offers a shortcut only for what the light exposes', () => {
    panel({ model: model({ caps: 'dim' }) });
    expect(shortcuts()).toEqual([]);
    cleanup();

    panel({ model: model({ caps: 'ct', mode: 'temp' }) });
    expect(shortcuts()).toEqual(['Temperatura']);
    cleanup();

    panel({
      extras: { supportsWhite: true, supportsEffects: true, supportsFlash: true, effects: ['Pulse'] },
      onExtraAction: vi.fn(),
    });
    expect(shortcuts()).toEqual(['Colore', 'Canale bianco', 'Effetti', 'Lampeggio']);
  });

  it('opens a shortcut as a screen of its own, and Back closes it', () => {
    const { container } = panel({ extras: { supportsEffects: true, effects: ['Pulse'] }, onExtraAction: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Indietro' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Effetti' }));
    expect(container.querySelector('.dv-panel-stage.has-section')).toBeTruthy();
    expect(container.querySelector('.dv-panel-section.is-open')?.textContent).toContain('Pulse');
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(container.querySelector('.dv-panel-stage.has-section')).toBeNull();
  });

  it('forgets the open screen when the panel moves to another light', () => {
    const extras = { supportsEffects: true, effects: ['Pulse'] };
    const onExtraAction = vi.fn();
    const onAction = vi.fn();
    const onClose = vi.fn();
    const tree = (light: LightModel) => (
      <I18nProvider>
        <LightPanel model={light} extras={extras} onExtraAction={onExtraAction} onAction={onAction} onClose={onClose} />
      </I18nProvider>
    );
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    const { container, rerender } = render(tree(model()));
    fireEvent.click(screen.getByRole('button', { name: 'Effetti' }));
    expect(container.querySelector('.has-section')).toBeTruthy();
    rerender(tree(model({ entityId: 'light.cucina', name: 'Cucina' })));
    expect(container.querySelector('.has-section')).toBeNull();
  });

  it('has one power button, which commands the light', () => {
    const onAction = vi.fn();
    panel({ onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Spegni Faretti' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_off' });
  });
});
