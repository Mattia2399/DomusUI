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
    expect(screen.getByText('21,5° · umidità 48% · 9 accessori accesi')).toBeTruthy();
    const rooms = screen.getByRole('navigation', { name: 'Stanze' });
    expect(within(rooms).getByRole('button', { name: 'Soggiorno' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Tutta la casa' })).toBeTruthy();
    const statuses = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(statuses).toEqual(['ClimaRiscalda a 23°', 'Luci3 accese', 'Umidità48%']);
    expect(screen.getByTestId('rooms-v2-add-row').textContent).toContain('Non ancora in questa stanza: sicurezza, media');
  });

  it('changes room from the pills', () => {
    renderDemo();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stanze' })).getByRole('button', { name: 'Camera' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Camera' })).toBeTruthy();
    expect(screen.getByText('19,5° · umidità 52% · 2 accessori accesi')).toBeTruthy();
  });

  it('brings a light from another room through the add sheet', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi accessorio' }));
    fireEvent.click(screen.getByRole('button', { name: /Luce del giardino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi 1' }));
    return screen.findByText('3/7');
  });

  it('shows the devices of the room by the section rule, with what each is doing', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-v2-devices');
    expect(within(section).getByText('4/6')).toBeTruthy();
    // To check first (the console on standby), then those on, then the rest; three cards and "+3".
    const names = Array.from(section.querySelectorAll('.dv-name')).map((node) => node.textContent);
    expect(names).toEqual(['Presa console', 'Presa TV', 'Tapparella']);
    expect(within(section).getByText('In standby · 4 W')).toBeTruthy();
    expect(within(section).getByText('Aperta 60%')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Mostra tutti: Dispositivi, altri 3' })).toBeTruthy();
  });

  it('closes a cover from its icon and shows it straight away', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-v2-devices');
    fireEvent.click(within(section).getByRole('button', { name: 'Chiudi Tapparella' }));
    expect(within(section).getByText('In chiusura · 60%')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Ferma Tapparella' })).toBeTruthy();
  });

  it('asks before turning off a protected plug', () => {
    renderDemo();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stanze' })).getByRole('button', { name: 'Cucina' }));
    const section = screen.getByTestId('rooms-v2-devices');
    fireEvent.click(within(section).getByRole('button', { name: 'Spegni Frigorifero, protetta' }));
    expect(screen.getByRole('dialog', { name: 'Spegnere Frigorifero?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    expect(within(section).getByRole('button', { name: 'Accendi Frigorifero, protetta' })).toBeTruthy();
  });

  it('opens the panel of a fan from its card', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Dispositivi, 6/ }));
    const page = screen.getByTestId('rooms-v2-section-page');
    fireEvent.click(within(page).getByRole('button', { name: /^Controlli di Ventilatore/ }));
    expect(screen.getByRole('slider', { name: 'Velocità Ventilatore' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notte' })).toBeTruthy();
  });

  it('shows the main climate unit large, with its target and steps, and the others small', () => {
    renderDemo();
    const climate = screen.getByTestId('rooms-v2-climate');
    const main = within(climate).getByTestId('climate-card');
    expect(within(main).getByText('Riscalda a')).toBeTruthy();
    expect(within(main).getByText('23°')).toBeTruthy();
    expect(within(main).getByText('Sta riscaldando · ora 21,5°')).toBeTruthy();
    fireEvent.click(within(main).getByRole('button', { name: 'Alza la temperatura, ora 23°' }));
    expect(within(main).getByText('23,5°')).toBeTruthy();
    expect(within(climate).getByText('20,5° → 21°')).toBeTruthy();
  });

  it('turns the climate off from its icon and opens its panel with the modes', () => {
    renderDemo();
    const main = within(screen.getByTestId('rooms-v2-climate')).getByTestId('climate-card');
    fireEvent.click(within(main).getByRole('button', { name: 'Spegni Climatizzatore' }));
    expect(within(main).getByText('In stanza')).toBeTruthy();
    fireEvent.click(within(main).getByRole('button', { name: /^Controlli di Climatizzatore/ }));
    const modes = screen.getByRole('radiogroup', { name: 'Modalità' });
    fireEvent.click(within(modes).getByRole('radio', { name: 'Raffresca' }));
    expect(within(main).getByText('Raffresca a')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Temperatura obiettivo Climatizzatore' })).toBeTruthy();
  });

  it('shows the sensors of the room, those to check first, with their value and where it sits', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-v2-sensors');
    // The light sensor is low on battery and the noise sensor is away: they come first, then by name.
    const names = Array.from(section.querySelectorAll('.dv-sensor .truncate.min-w-0')).map((node) => node.textContent);
    expect(names).toEqual(['Luminosità', 'Rumore', 'CO₂']);
    expect(within(section).getByRole('button', { name: 'Mostra tutti: Ambiente, altri 3' })).toBeTruthy();
    expect(within(section).getByText('Aria buona')).toBeTruthy();
    expect(within(section).getByText('Non disponibile')).toBeTruthy();
  });

  it('opens the detail of a sensor with its history and statistics', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Ambiente, 6/ }));
    const page = screen.getByTestId('rooms-v2-section-page');
    fireEvent.click(within(page).getByRole('button', { name: /^Umidità 48%, Ideale/ }));
    const dialog = screen.getByRole('dialog', { name: 'Umidità' });
    expect(within(dialog).getByText('Fascia ideale 40–60%')).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: /^Umidità, ultime 24 ore: minimo/ })).toBeTruthy();
    expect(within(dialog).getByText('Batteria 82%')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: '7 giorni' }));
    expect(within(dialog).getByRole('img', { name: /^Umidità, ultime 7 giorni/ })).toBeTruthy();
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
