import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomsV2Page } from './RoomsV2Page';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderDemo() {
  return render(<RoomsV2Page runtimeMode="demo" haConnected={false} haAreas={[]} haStates={{}} />);
}

describe('the second Rooms page in the demo', () => {
  it('shows the room, its lights as three cards and a card for the rest', () => {
    renderDemo();
    expect(screen.getByRole('heading', { level: 1, name: 'Soggiorno' })).toBeTruthy();
    const lights = screen.getByTestId('rooms-v2-lights');
    expect(within(lights).getByText('3/6')).toBeTruthy();
    expect(within(lights).getByRole('button', { name: 'Mostra tutti: Luci, altri 3' })).toBeTruthy();
    expect(screen.getByTestId('rooms-v2-placeholder')).toBeTruthy();
  });

  it('turns every light off', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni tutte' }));
    expect(within(screen.getByTestId('rooms-v2-lights')).getByText('0/6')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Spegni tutte' })).toBeNull();
  });

  it('puts a light in evidence from the section page, first in the room, and remembers it', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Luci, 6/ }));
    const page = screen.getByTestId('rooms-v2-section-page');
    fireEvent.click(within(page).getByRole('button', { name: 'Modifica' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Seleziona Applique' }));
    fireEvent.click(within(page).getByRole('button', { name: 'In evidenza' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Fine' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Indietro' }));
    const names = Array.from(screen.getByTestId('rooms-v2-lights').querySelectorAll('.dv-name')).map((node) => node.textContent);
    expect(names[0]).toBe('Applique');
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.pinnedEntitiesByRoom.v1.demo') ?? '{}')).toEqual({
      'demo-living-room': ['light.demo_wall_lamp'],
    });
  });

  it('hides a light from the room, never from its page', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Luci, 6/ }));
    const page = screen.getByTestId('rooms-v2-section-page');
    fireEvent.click(within(page).getByRole('button', { name: 'Modifica' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Seleziona Faretti' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Nascondi' }));
    expect(within(page).getByRole('region', { name: 'Nascosti nella stanza' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.hiddenEntitiesByRoom.v1.demo') ?? '{}')).toEqual({
      'demo-living-room': ['light.demo_spots'],
    });
  });
});
