import { cleanup, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { ScenesCard, SCENES_CATALOG } from './ScenesCard';

// A phone-wide card: 358 px wide, tall enough for the names and the status.
vi.mock('./useCardSize', () => ({
  useCardSize: () => ({ ref: { current: null }, density: 'compact', width: 358, height: 180, hasSize: true }),
}));

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

afterEach(() => cleanup());

const sceneButtons = () => SCENES_CATALOG.map((scene) => screen.queryByRole('button', { name: new RegExp(scene.label) })).filter(Boolean) as HTMLElement[];

describe('ScenesCard', () => {
  it('shares the width between the scenes that fit', () => {
    render(<ScenesCard scenes={['music', 'going-out', 'night', 'movie']} />);

    const buttons = sceneButtons();
    expect(buttons).toHaveLength(4);
    buttons.forEach((button) => expect(button.style.flex).toBe(''));
  });

  it('shows half of the next scene at the edge when they do not fit', () => {
    render(<ScenesCard scenes={SCENES_CATALOG.map((scene) => scene.id)} />);

    const buttons = sceneButtons();
    expect(buttons).toHaveLength(7);
    // 334 px of row, 6 px gaps: three whole buttons and half of the fourth.
    const width = (334 - 3 * 6) / 3.5;
    buttons.forEach((button) => expect(button.style.flex).toBe(`0 0 ${width}px`));
  });
});
