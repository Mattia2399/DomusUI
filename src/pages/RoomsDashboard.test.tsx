import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomsDashboard } from './RoomsDashboard';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function renderRooms(canManageRooms: boolean) {
  return render(
    <RoomsDashboard
      runtimeMode="demo"
      haConnected={false}
      canManageRooms={canManageRooms}
      haAreas={[]}
      haStates={{}}
    />,
  );
}

describe('RoomsDashboard permissions', () => {
  it('collapses the room header while keeping native touch scrolling', () => {
    const { container } = renderRooms(false);
    const dashboard = container.querySelector<HTMLElement>('.rooms-dashboard');
    const header = screen.getByTestId('rooms-page-header');
    const titleScroller = screen.getByTestId('rooms-title-scroller');

    expect(header.getAttribute('data-compact')).toBe('false');
    expect(titleScroller.className).toContain('touch-auto');

    dashboard!.scrollTop = 40;
    fireEvent.scroll(dashboard!);
    expect(header.getAttribute('data-compact')).toBe('false');

    dashboard!.scrollTop = 64;
    fireEvent.scroll(dashboard!);
    expect(header.getAttribute('data-compact')).toBe('true');

    dashboard!.scrollTop = 40;
    fireEvent.scroll(dashboard!);
    expect(header.getAttribute('data-compact')).toBe('true');

    dashboard!.scrollTop = 0;
    fireEvent.scroll(dashboard!);
    expect(header.getAttribute('data-compact')).toBe('false');
  });

  it('keeps locally created Demo rooms out of the real house', () => {
    window.localStorage.setItem(
      'ha.dashboard.rooms.customRooms.v1.demo',
      JSON.stringify([{ id: 'custom-demo-room', name: 'Stanza Demo', createdAt: 1 }]),
    );

    render(
      <RoomsDashboard
        runtimeMode="real"
        haConnected
        canManageRooms
        haAreas={[]}
        haStates={{}}
      />,
    );

    expect(screen.queryByText('Stanza Demo')).toBeNull();
    expect(screen.getByText('Nessuna stanza configurata')).not.toBeNull();
  });

  it('does not invent rooms when the real Home Assistant registry is empty', () => {
    render(
      <RoomsDashboard
        runtimeMode="real"
        haConnected
        canManageRooms
        haAreas={[]}
        haStates={{}}
      />,
    );

    expect(screen.getByText('Nessuna stanza configurata')).not.toBeNull();
    expect(screen.queryByText('Soggiorno')).toBeNull();
    expect(screen.queryByText('Camera')).toBeNull();
    expect(screen.queryByText('Cucina')).toBeNull();
    expect(screen.queryByText('Bagno')).toBeNull();
  });

  it('keeps room management entry points hidden for a limited user', () => {
    renderRooms(false);

    expect(screen.queryByRole('button', { name: /^Aggiungi dispositivi$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Apri lista piani/i }));

    expect(screen.queryByRole('button', { name: /Modifica piano/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Elimina piano/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Aggiungi un piano/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gestisci o Aggiungi Stanza/i })).toBeNull();
  });

  it('exposes local room management to an authorized dashboard editor', () => {
    renderRooms(true);

    fireEvent.click(screen.getByRole('button', { name: /Apri lista piani/i }));

    expect(screen.getByRole('button', { name: /Aggiungi un piano/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Gestisci o Aggiungi Stanza/i })).not.toBeNull();
  });
});
