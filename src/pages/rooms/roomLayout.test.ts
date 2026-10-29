import { describe, expect, it } from 'vitest';
import type { RoomTab } from '../../components/rooms/roomsDirectory';
import { DEFAULT_SECTIONS, moveRoom, moveSection, orderRooms, parseRoomLayout, sectionsFor, toggleSection } from './roomLayout';

const room = (id: string): RoomTab => ({ id, name: id, source: 'custom' });
const FLOOR: Record<string, string> = { living: 'ground', kitchen: 'ground', bedroom: 'first', bath: 'first' };
const floorOf = (tab: RoomTab) => FLOOR[tab.id] ?? null;

describe('the layout of the Rooms page', () => {
  it('reads what was saved, keeping every section once and dropping what is not valid', () => {
    const layout = parseRoomLayout(
      JSON.stringify({
        order: ['kitchen', 'kitchen', 3, 'living'],
        looks: { kitchen: { glow: 2, hidden: true, icon: 'mdi:stove' }, bath: { glow: 99 } },
        floors: [{ id: 'ground', name: 'Terra' }, { id: '', name: 'x' }],
        sections: { all: { order: ['media', 'lights', 'nope'], hidden: { media: true, nope: true } }, rooms: { bath: { order: [] } } },
      }),
    );
    expect(layout?.order).toEqual(['kitchen', 'living']);
    expect(layout?.looks).toEqual({ kitchen: { glow: 2, hidden: true, icon: 'mdi:stove' } });
    expect(layout?.floors).toEqual([{ id: 'ground', name: 'Terra' }]);
    expect(layout?.sections.all).toEqual({
      order: ['media', 'lights', 'scenes', 'climate', 'sensors', 'switches', 'security'],
      hidden: { media: true },
    });
    expect(layout?.sections.rooms.bath).toEqual(DEFAULT_SECTIONS);
    expect(parseRoomLayout('not json')).toBeNull();
  });

  it('puts the rooms in the order of the bar, the new ones after', () => {
    const tabs = ['living', 'kitchen', 'bedroom', 'bath'].map(room);
    expect(orderRooms(tabs, ['bath', 'kitchen']).map((tab) => tab.id)).toEqual(['bath', 'kitchen', 'living', 'bedroom']);
  });

  it('moves a room only among the rooms of its floor', () => {
    const tabs = ['living', 'bedroom', 'kitchen', 'bath'].map(room);
    expect(moveRoom(tabs, 'kitchen', -1, floorOf)).toEqual(['kitchen', 'bedroom', 'living', 'bath']);
    expect(moveRoom(tabs, 'living', -1, floorOf)).toEqual(['living', 'bedroom', 'kitchen', 'bath']);
  });

  it('orders and turns off the sections, for every room or for one', () => {
    const layout = parseRoomLayout(JSON.stringify({ sections: { rooms: { bath: { order: ['media'] } } } }))!;
    expect(sectionsFor(layout, 'bath').order[0]).toBe('media');
    expect(sectionsFor(layout, 'living')).toEqual(DEFAULT_SECTIONS);
    const moved = moveSection(DEFAULT_SECTIONS, 'lights', -1);
    expect(moved.order.slice(0, 4)).toEqual(['scenes', 'climate', 'lights', 'sensors']);
    expect(moveSection(DEFAULT_SECTIONS, 'scenes', -1)).toBe(DEFAULT_SECTIONS);
    expect(toggleSection(toggleSection(DEFAULT_SECTIONS, 'media'), 'media').hidden).toEqual({});
    expect(toggleSection(DEFAULT_SECTIONS, 'media').hidden).toEqual({ media: true });
  });
});
