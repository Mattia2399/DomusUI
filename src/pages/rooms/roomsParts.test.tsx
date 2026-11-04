import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Deferred, Panel, preloadRoomsParts } from './roomsParts';
import { toLightModel } from '../../components/devices/model/light';
import { loadPanelEntry } from '../../components/devices/panels/registry';

// Compiling a panel on its first import can take longer than a test is given.
beforeAll(async () => {
  await Promise.all([loadPanelEntry('light'), import('../../components/devices/panels/Panel')]);
}, 120_000);

afterEach(cleanup);

function Broken(): React.ReactElement {
  throw new Error('chunk failed');
}

describe('the parts of the Rooms page loaded on request', () => {
  it('shows a panel once its code has arrived', async () => {
    const model = toLightModel('light.salotto', { state: 'on', rawAttributes: { friendly_name: 'Salotto', brightness: 128 } })!;
    render(
      <Deferred>
        <Panel kind="light" input={{ model, onAction: vi.fn() }} onClose={vi.fn()} />
      </Deferred>,
    );
    expect(await screen.findByRole('heading', { name: 'Salotto' })).toBeTruthy();
  });

  it('shows nothing, and keeps the page, when a part cannot load', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <p>Pagina</p>
        <Deferred>
          <Broken />
        </Deferred>
      </div>,
    );
    expect(screen.getByText('Pagina')).toBeTruthy();
    error.mockRestore();
  });

  it('fetches every part ahead without throwing', () => {
    expect(() => preloadRoomsParts()).not.toThrow();
  });
});
