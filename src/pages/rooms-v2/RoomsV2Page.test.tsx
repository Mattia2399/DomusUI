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
  });

  it('heads the room like the design: summary, rooms as pills, statuses and what it lacks', () => {
    renderDemo();
    expect(screen.getByText('21,5° · umidità 48% · 3 accessori accesi')).toBeTruthy();
    const rooms = screen.getByRole('navigation', { name: 'Stanze' });
    expect(within(rooms).getByRole('button', { name: 'Soggiorno' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Tutta la casa' })).toBeTruthy();
    const statuses = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(statuses).toEqual(['Luci3 accese', 'Umidità48%']);
    expect(screen.getByTestId('rooms-v2-add-row').textContent).toContain('Non ancora in questa stanza: clima, dispositivi, sicurezza, media');
  });

  it('changes room from the pills', () => {
    renderDemo();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stanze' })).getByRole('button', { name: 'Camera' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Camera' })).toBeTruthy();
    expect(screen.getByText('19,5° · umidità 52% · 1 accessorio acceso')).toBeTruthy();
  });

  it('brings a light from another room through the add sheet', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi accessorio' }));
    fireEvent.click(screen.getByRole('button', { name: /Luce del giardino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi 1' }));
    return screen.findByText('3/7');
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
