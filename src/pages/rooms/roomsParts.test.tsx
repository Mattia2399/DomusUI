import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deferred, LightPanel, preloadRoomsParts } from './roomsParts';
import { toLightModel } from '../../components/devices/model/light';

afterEach(cleanup);

function Broken(): React.ReactElement {
  throw new Error('chunk failed');
}

describe('the parts of the Rooms page loaded on request', () => {
  it('shows a panel once its code has arrived', async () => {
    const model = toLightModel('light.salotto', { state: 'on', rawAttributes: { friendly_name: 'Salotto', brightness: 128 } })!;
    render(
      <Deferred>
        <LightPanel model={model} onAction={vi.fn()} onClose={vi.fn()} />
      </Deferred>,
    );
    expect(await screen.findByText('Salotto')).toBeTruthy();
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
