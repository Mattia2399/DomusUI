import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomsPage } from './RoomsPage';

// The parts the page opens on request, here at once: how they load is tested in roomsParts.test.tsx.
vi.mock('./roomsParts', async () => {
  const [panelView, lightEntries, deviceEntries, climateEntries, cameraEntries, sensorEntries, security, media, mediaSheets, section, accessories, manage, roomSheets, liveGate] = await Promise.all([
    import('../../components/devices/panels/PanelView'),
    import('../../components/devices/panels/entries/light'),
    import('../../components/devices/panels/entries/device'),
    import('../../components/devices/panels/entries/climate'),
    import('../../components/devices/panels/entries/camera'),
    import('../../components/devices/panels/entries/sensor'),
    import('../../components/devices/panels/SecurityPanel'),
    import('../../components/devices/panels/MediaPlayer'),
    import('./MediaSheets'),
    import('./SectionPage'),
    import('./AddAccessoriesSheet'),
    import('./RoomsManagePage'),
    import('./RoomManageSheets'),
    import('../../components/devices/panels/PanelLiveGate'),
  ]);
  const entryViews: Record<string, React.ComponentType<{ input: never; live?: never; onClose: () => void }>> = Object.fromEntries(
    Object.entries({ light: lightEntries.lightEntry, plug: deviceEntries.plugEntry, fan: deviceEntries.fanEntry, humidifier: deviceEntries.humidifierEntry, cover: deviceEntries.coverEntry, climate: climateEntries.climateEntry, camera: cameraEntries.cameraEntry, sensor: sensorEntries.sensorEntry }).map(([kind, entry]) => [
      kind,
      function EntryView({ input, live, onClose }: { input: never; live?: never; onClose: () => void }) {
        return <panelView.PanelView spec={entry.useSpec(input)} live={live} onClose={onClose} />;
      },
    ]),
  );
  return {
    Panel: ({ kind, ...props }: { kind: string; input: never; live?: never; onClose: () => void }) => {
      const View = entryViews[kind];
      return <View {...props} />;
    },
    SecurityPanel: security.SecurityPanel,
    MediaPlayer: media.MediaPlayer,
    MediaPickPanel: mediaSheets.MediaPickPanel,
    MediaStartPanel: mediaSheets.MediaStartPanel,
    SectionPage: section.SectionPage,
    AddAccessoriesSheet: accessories.AddAccessoriesSheet,
    RoomsManagePage: manage.RoomsManagePage,
    RoomEditPanel: roomSheets.RoomEditPanel,
    PanelLiveGate: liveGate.PanelLiveGate,
    Deferred: ({ children }: { children: React.ReactNode }) => children,
    preloadRoomsParts: () => undefined,
  };
});

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderDemo() {
  return render(<RoomsPage runtimeMode="demo" haConnected={false} haAreas={[]} haStates={{}} />);
}

describe('the Rooms page in the demo', () => {
  it('shows the room, its lights as three cards and a card for the rest', () => {
    renderDemo();
    expect(screen.getByRole('heading', { level: 1, name: 'Soggiorno' })).toBeTruthy();
    const lights = screen.getByTestId('rooms-lights');
    expect(within(lights).getByText('3/6')).toBeTruthy();
    expect(within(lights).getByRole('button', { name: 'Mostra tutti: Luci, altri 3' })).toBeTruthy();
  });

  it('heads the room like the design: summary, rooms as pills, statuses and what it lacks', () => {
    renderDemo();
    expect(screen.getByText('21,5° · umidità 48% · 10 accessori accesi')).toBeTruthy();
    const rooms = screen.getByRole('navigation', { name: 'Stanze' });
    expect(within(rooms).getByRole('button', { name: 'Soggiorno' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Tutta la casa' })).toBeTruthy();
    const statuses = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(statuses).toEqual(['ClimaRiscalda a 23°', 'Luci3 accese', 'Umidità48%', 'MediaIl viaggio di ritorno']);
    // The living room has every section: nothing left to add.
    expect(screen.queryByTestId('rooms-add-row')).toBeNull();
  });

  it('changes room from the pills', () => {
    renderDemo();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stanze' })).getByRole('button', { name: 'Camera Richiede attenzione' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Camera' })).toBeTruthy();
    expect(screen.getByText('19,5° · umidità 52% · 2 accessori accesi')).toBeTruthy();
  });

  it('brings a light from another room through the add sheet', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Aggiungi accessorio' }));
    fireEvent.click(screen.getByRole('button', { name: /Luce del giardino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi 1' }));
    return screen.findByText('3/7');
  });

  it('shows the devices of the room by the section rule, with what each is doing', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-devices');
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
    const section = screen.getByTestId('rooms-devices');
    fireEvent.click(within(section).getByRole('button', { name: 'Chiudi Tapparella' }));
    expect(within(section).getByText('In chiusura · 60%')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Ferma Tapparella' })).toBeTruthy();
  });

  it('asks before turning off a protected plug', () => {
    renderDemo();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stanze' })).getByRole('button', { name: 'Cucina' }));
    const section = screen.getByTestId('rooms-devices');
    fireEvent.click(within(section).getByRole('button', { name: 'Spegni Frigorifero, protetta' }));
    expect(screen.getByRole('dialog', { name: 'Spegnere Frigorifero?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));
    expect(within(section).getByRole('button', { name: 'Accendi Frigorifero, protetta' })).toBeTruthy();
  });

  it('opens the panel of a fan from its card', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Dispositivi, 6/ }));
    const page = screen.getByTestId('rooms-section-page');
    fireEvent.click(within(page).getByRole('button', { name: /^Controlli di Ventilatore/ }));
    expect(screen.getByRole('slider', { name: 'Velocità Ventilatore' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Notte' })).toBeTruthy();
  });

  it('shows the main climate unit large, with its target and steps, and the others small', () => {
    renderDemo();
    const climate = screen.getByTestId('rooms-climate');
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
    const main = within(screen.getByTestId('rooms-climate')).getByTestId('climate-card');
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
    const section = screen.getByTestId('rooms-sensors');
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
    const page = screen.getByTestId('rooms-section-page');
    fireEvent.click(within(page).getByRole('button', { name: /^Umidità 48%, Ideale/ }));
    const dialog = screen.getByRole('dialog', { name: 'Umidità' });
    expect(within(dialog).getByRole('img', { name: 'Fascia ideale 40–60%' })).toBeTruthy();
    expect(within(dialog).getAllByText('Minimo').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Batteria 82%')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: '7 giorni' }));
    expect(within(dialog).getByRole('radio', { name: '7 giorni' }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialog).getByRole('img', { name: 'Fascia ideale 40–60%' })).toBeTruthy();
  });

  it('shows the scenes of the room as a strip, runs one, and offers to undo it', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-scenes');
    expect(within(section).getByRole('button', { name: 'Mostra tutti: Scene, altri 2' })).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: /^Avvia la scena Concentrazione/ }));
    expect(within(section).getByText('Applico · 3 dispositivi')).toBeTruthy();
    const toast = screen.getByTestId('rooms-scene-undo');
    expect(within(toast).getByText('Scena Concentrazione attivata')).toBeTruthy();
    fireEvent.click(within(toast).getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByTestId('rooms-scene-undo')).toBeNull();
  });

  it('turns every light off', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni tutte' }));
    expect(within(screen.getByTestId('rooms-lights')).getByText('0/6')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Spegni tutte' })).toBeNull();
  });

  it('puts a light in evidence from the section page, first in the room, and remembers it', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Luci, 6/ }));
    const page = screen.getByTestId('rooms-section-page');
    fireEvent.click(within(page).getByRole('button', { name: 'Modifica' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Seleziona Applique' }));
    fireEvent.click(within(page).getByRole('button', { name: 'In evidenza' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Fine' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Indietro' }));
    const names = Array.from(screen.getByTestId('rooms-lights').querySelectorAll('.dv-name')).map((node) => node.textContent);
    expect(names[0]).toBe('Applique');
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.pinnedEntitiesByRoom.v1.demo') ?? '{}')).toEqual({
      'demo-living-room': ['light.demo_wall_lamp'],
    });
  });

  it('hides a light from the room, never from its page', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: /^Mostra tutti: Luci, 6/ }));
    const page = screen.getByTestId('rooms-section-page');
    fireEvent.click(within(page).getByRole('button', { name: 'Modifica' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Seleziona Faretti' }));
    fireEvent.click(within(page).getByRole('button', { name: 'Nascondi' }));
    expect(within(page).getByRole('region', { name: 'Nascosti nella stanza' })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.hiddenEntitiesByRoom.v1.demo') ?? '{}')).toEqual({
      'demo-living-room': ['light.demo_spots'],
    });
  });

  it('shows the security of the room: to check first, then motion and the lock', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-security');
    const names = Array.from(section.querySelectorAll('.dv-name')).map((node) => node.textContent);
    expect(names).toEqual(['Finestra laterale', 'Movimento', 'Serratura ingresso']);
    expect(within(section).getByText('Chiusa · batteria 12%')).toBeTruthy();
    expect(within(section).getByText('Movimento adesso')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Mostra tutti: Sicurezza, altri 4' })).toBeTruthy();
  });

  it('unlocks the lock by holding its ring, and locks it again with a tap', () => {
    vi.useFakeTimers();
    try {
      renderDemo();
      const section = screen.getByTestId('rooms-security');
      const ring = within(section).getByRole('button', {
        name: 'Tieni premuto per sbloccare Serratura ingresso, continua per aprire la porta',
      });
      // Let go too soon: it asks to hold longer.
      fireEvent.pointerDown(ring);
      act(() => vi.advanceTimersByTime(300));
      fireEvent.pointerUp(ring);
      expect(within(section).getByText('Chiusa · tieni premuto di più')).toBeTruthy();
      // The first lap unlocks; letting go in the second does not open the door.
      fireEvent.pointerDown(ring);
      act(() => vi.advanceTimersByTime(900));
      expect(within(section).getByText('Sblocco… · continua per aprire')).toBeTruthy();
      fireEvent.pointerUp(ring);
      act(() => vi.advanceTimersByTime(1400));
      expect(within(section).getByText('Sbloccata · tieni per aprire')).toBeTruthy();
      // Unlocked, a tap locks it.
      const unlocked = within(section).getByRole('button', {
        name: 'Tocca per bloccare Serratura ingresso, tieni premuto per aprire la porta',
      });
      fireEvent.pointerDown(unlocked);
      fireEvent.pointerUp(unlocked);
      expect(within(section).getByText('Blocco… · in attesa…')).toBeTruthy();
      act(() => vi.advanceTimersByTime(1400));
      expect(within(section).getByText('Chiusa · tieni premuto')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the door when the ring is held through both laps', () => {
    vi.useFakeTimers();
    try {
      renderDemo();
      const section = screen.getByTestId('rooms-security');
      const ring = within(section).getByRole('button', { name: /^Tieni premuto per sbloccare Serratura ingresso/ });
      fireEvent.pointerDown(ring);
      act(() => vi.advanceTimersByTime(900 + 1050));
      expect(within(section).getByText('Apertura… · in attesa…')).toBeTruthy();
      act(() => vi.advanceTimersByTime(1200));
      expect(within(section).getByText('Porta aperta · scrocco rilasciato')).toBeTruthy();
      act(() => vi.advanceTimersByTime(2600));
      expect(within(section).getByText('Sbloccata · tieni per aprire')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows what plays in the room, and pauses and moves on from the card', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-media');
    const card = within(section).getByRole('group', { name: 'In riproduzione su TV Soggiorno' });
    expect(within(card).getByText('Il viaggio di ritorno')).toBeTruthy();
    expect(within(card).getByText('TV Soggiorno · App TV')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Metti in pausa' }));
    expect(within(card).getByRole('button', { name: 'Riproduci' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Successivo' }));
    expect(within(card).getByText('Le Alpi viste dal cielo')).toBeTruthy();
    // The volume is only in the player.
    expect(within(card).queryByRole('slider', { name: 'Volume' })).toBeNull();
  });

  it('chooses the player of the room; the one playing pauses', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-media');
    fireEvent.click(within(section).getByRole('button', { name: 'Scegli il lettore, ora TV Soggiorno' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Soundbar/ }));
    expect(within(section).getByTestId('media-off').textContent).toContain('Spento · ultimo: Strade di sera');
    // Starting it from where it was.
    fireEvent.click(within(section).getByRole('button', { name: 'Avvia Soundbar' }));
    fireEvent.click(screen.getByRole('button', { name: /Riprendi l’ascolto/ }));
    expect(within(section).getByRole('group', { name: 'In riproduzione su Soundbar' })).toBeTruthy();
  });

  it('opens the full player with its sources and sound modes', () => {
    renderDemo();
    const section = screen.getByTestId('rooms-media');
    fireEvent.click(within(section).getByRole('button', { name: 'Apri il player completo' }));
    const player = screen.getByTestId('media-player');
    expect(within(player).getByRole('heading', { name: 'Il viaggio di ritorno' })).toBeTruthy();
    expect(within(player).getByRole('slider', { name: 'Volume' })).toBeTruthy();
    fireEvent.click(within(player).getByRole('button', { name: 'Sorgente' }));
    fireEvent.click(within(player).getByRole('radio', { name: 'HDMI 1 · Console' }));
    expect(within(player).getByRole('radio', { name: 'HDMI 1 · Console' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(player).getByRole('button', { name: 'Indietro' }));
    fireEvent.click(within(player).getByRole('button', { name: 'Audio' }));
    fireEvent.click(within(player).getByRole('radio', { name: 'Film' }));
    expect(within(player).getByRole('radio', { name: 'Film' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(player).getByRole('button', { name: 'Riduci il player' }));
    expect(screen.queryByTestId('media-player')).toBeNull();
  });

  it('marks the room with a window open and says it in the status row', () => {
    renderDemo();
    const rooms = screen.getByRole('navigation', { name: 'Stanze' });
    expect(within(within(rooms).getByRole('button', { name: /^Camera/ })).getByRole('img', { name: 'Richiede attenzione' })).toBeTruthy();
    expect(within(within(rooms).getByRole('button', { name: 'Soggiorno' })).queryByRole('img')).toBeNull();
    fireEvent.click(within(rooms).getByRole('button', { name: /^Camera/ }));
    const statuses = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(statuses[0]).toMatch(/^SicurezzaFinestra · Aperta da \d+ min$/);
  });

  it('adds a local room from the + menu, changes it from Stanze e sezioni and deletes it', async () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nuova stanza' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: '  Studio ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Scrivania' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Primo piano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crea stanza' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Studio' })).toBeTruthy();
    const rooms = screen.getByRole('navigation', { name: 'Stanze' });
    expect(within(rooms).getByRole('button', { name: 'Soggiorno' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    const manage = screen.getByTestId('rooms-manage');
    const firstFloor = within(manage).getByRole('region', { name: 'Primo piano' });
    expect(within(firstFloor).getByRole('button', { name: 'Modifica Studio' })).toBeTruthy();
    fireEvent.click(within(firstFloor).getByRole('button', { name: 'Modifica Studio' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Studio nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await within(manage).findByRole('button', { name: 'Modifica Studio nord' })).toBeTruthy();

    fireEvent.click(within(manage).getByRole('button', { name: 'Modifica Studio nord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elimina stanza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tocca di nuovo: i dispositivi restano senza stanza' }));
    await vi.waitFor(() => expect(within(manage).queryByRole('button', { name: 'Modifica Studio nord' })).toBeNull());
  });

  it('orders the rooms of a floor and hides one from the bar', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    const manage = screen.getByTestId('rooms-manage');
    fireEvent.click(within(manage).getByRole('button', { name: 'Sposta Cucina prima' }));
    fireEvent.click(within(manage).getByRole('button', { name: 'Modifica Bagno' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Nascondi dalla barra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    fireEvent.click(within(manage).getByRole('button', { name: /^Soggiorno|Chiudi/ }));
    const names = within(screen.getByRole('navigation', { name: 'Stanze' }))
      .getAllByRole('button')
      .map((pill) => pill.textContent);
    // Kitchen and living room swap places in the bar; the bathroom no longer shows.
    expect(names).toEqual(['Cucina', 'Camera', 'Soggiorno']);
    expect(JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.layout.v1.demo') ?? '{}').looks['demo-bathroom']).toMatchObject({ hidden: true });
  });

  it('orders and turns off the sections, for every room or only for one', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    const manage = screen.getByTestId('rooms-manage');
    fireEvent.click(within(manage).getByRole('radio', { name: 'Sezioni' }));
    fireEvent.click(within(manage).getByRole('button', { name: 'Sposta Media più in alto' }));
    fireEvent.click(within(manage).getByRole('switch', { name: 'Scene' }));
    fireEvent.click(within(manage).getByRole('radio', { name: 'Solo Soggiorno' }));
    expect(within(manage).getByText('Soggiorno usa l’ordine di tutte le stanze.')).toBeTruthy();
    fireEvent.click(within(manage).getByRole('switch', { name: 'Luci' }));
    expect(within(manage).getByText('Soggiorno ha un ordine suo.')).toBeTruthy();
    const layout = JSON.parse(window.localStorage.getItem('ha.dashboard.rooms.layout.v1.demo') ?? '{}');
    expect(layout.sections.all.order.slice(-2)).toEqual(['media', 'security']);
    expect(layout.sections.all.hidden).toEqual({ scenes: true });
    expect(layout.sections.rooms['demo-living-room'].hidden).toEqual({ scenes: true, lights: true });
    fireEvent.click(within(manage).getByRole('button', { name: 'Usa l’ordine comune' }));
    fireEvent.click(within(manage).getByRole('button', { name: /^Soggiorno/ }));
    // Scenes are off for every room now.
    expect(screen.queryByTestId('rooms-scenes')).toBeNull();
    expect(screen.getByTestId('rooms-lights')).toBeTruthy();
  });

  it('adds, renames and deletes a floor of the demo, only when it has no rooms', () => {
    renderDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    const manage = screen.getByTestId('rooms-manage');
    fireEvent.click(within(manage).getByRole('radio', { name: 'Piani' }));
    expect(within(manage).getByRole('button', { name: 'Sposta prima le stanze di Piano terra' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(manage).getByRole('button', { name: 'Nuovo piano' }));
    const name = within(manage).getByRole('textbox', { name: 'Nome del piano 3' });
    fireEvent.change(name, { target: { value: 'Mansarda' } });
    fireEvent.blur(name);
    fireEvent.click(within(manage).getByRole('button', { name: 'Elimina Mansarda' }));
    expect(within(manage).queryByRole('textbox', { name: 'Nome del piano 3' })).toBeNull();
  });
});

describe('the Rooms page with Home Assistant', () => {
  const living = { area_id: 'living', name: 'Soggiorno', floor_id: null, icon: null };

  function renderConnected(onCallApi: (message: Record<string, unknown>) => Promise<unknown>, onNavigate = vi.fn()) {
    render(
      <RoomsPage
        runtimeMode="real"
        haConnected
        canManageRooms
        haAreas={[living]}
        haStates={{ 'sensor.living_temperature': { state: '21', rawAttributes: { friendly_name: 'Temperatura soggiorno', device_class: 'temperature', unit_of_measurement: '°C' } } }}
        onCallApi={onCallApi}
        onNavigate={onNavigate}
      />,
    );
    return onNavigate;
  }

  it('changes an area in Home Assistant: icon and temperature sensor', async () => {
    const onCallApi = vi.fn(async (message: Record<string, unknown>) =>
      message.type === 'config/area_registry/update' ? { ...living, icon: message.icon, temperature_entity_id: message.temperature_entity_id } : [],
    );
    renderConnected(onCallApi);
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    fireEvent.click(within(screen.getByTestId('rooms-manage')).getByRole('button', { name: 'Modifica Soggiorno' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Divano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entità temperatura' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Temperatura soggiorno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await vi.waitFor(() =>
      expect(onCallApi).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'config/area_registry/update',
          area_id: 'living',
          icon: 'mdi:sofa',
          temperature_entity_id: 'sensor.living_temperature',
        }),
      ),
    );
  });

  it('creates a floor in Home Assistant from Stanze e sezioni', async () => {
    const onCallApi = vi.fn(async (message: Record<string, unknown>) =>
      message.type === 'config/floor_registry/create' ? { floor_id: 'attic', name: message.name } : [],
    );
    renderConnected(onCallApi);
    fireEvent.click(screen.getByRole('button', { name: 'Gestisci stanze e sezioni' }));
    const manage = screen.getByTestId('rooms-manage');
    fireEvent.click(within(manage).getByRole('radio', { name: 'Piani' }));
    fireEvent.click(within(manage).getByRole('button', { name: 'Nuovo piano' }));
    expect(await within(manage).findByRole('textbox', { name: 'Nome del piano 1' })).toBeTruthy();
    expect(onCallApi).toHaveBeenCalledWith({ type: 'config/floor_registry/create', name: 'Nuovo piano' });
  });
});
