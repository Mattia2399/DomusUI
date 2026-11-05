import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider';
import { PanelView } from './PanelView';
import { arrangeControls, MOST_IN_THE_ROW, PANEL_CONTROLS, type PanelControl, type PanelSpec } from './registry';

beforeEach(() => window.localStorage.setItem('domusui.language.v1', 'it'));
afterEach(cleanup);

const big = (id: string, extra: Partial<PanelControl> = {}): PanelControl => ({
  id,
  place: 'main',
  icon: <svg />,
  label: id,
  looks: ['tiles', 'list'],
  big: (look) => <p>{`grande ${id} ${look}`}</p>,
  group: <p>{`gruppo ${id}`}</p>,
  ...extra,
} as PanelControl);

const action = (id: string, onPress = vi.fn()): PanelControl => ({ id, place: 'main', icon: <svg />, label: id, actionLabel: `Fai ${id}`, onPress });

const spec = (controls: PanelControl[], over: Partial<PanelSpec> = {}): PanelSpec => ({
  owner: 'x',
  name: 'Dispositivo',
  status: 'Acceso',
  accent: { color: '#ff9f0a', ink: '#000', rgb: '255 159 10' },
  tint: true,
  heroKind: 'value',
  hero: <p>protagonista</p>,
  heroName: 'Obiettivo 21°',
  controls,
  ...over,
});

const draw = (value: PanelSpec) => render(<I18nProvider><PanelView spec={value} onClose={vi.fn()} /></I18nProvider>);
const row = () => within(screen.getByRole('navigation'));

const ids = (list: { control: PanelControl }[]) => list.map((entry) => entry.control.id);

describe('what stands where: one function, with the counts that add up', () => {
  const many = (count: number, place: 'main' | 'more' = 'main') => Array.from({ length: count }, (_, index) => big(`${place}${index}`, { place }));

  it('has eight in the row when there is nothing else', () => {
    const { main, more } = arrangeControls(undefined, many(8));
    expect(main).toHaveLength(MOST_IN_THE_ROW);
    expect(more).toHaveLength(0);
  });

  it('has seven and Altro beyond eight, with those over the limit in Altro', () => {
    const { main, more } = arrangeControls(undefined, many(10));
    expect(main).toHaveLength(7);
    expect(ids(more)).toEqual(['main7', 'main8', 'main9']);
  });

  it('has seven and Altro when eight are in the row and something is in Altro', () => {
    const { main, more } = arrangeControls(undefined, [...many(8), ...many(1, 'more')]);
    expect(main).toHaveLength(7);
    expect(ids(more)).toEqual(['main7', 'more0']);
  });

  it('brings one alone up to the row, so that Altro does not hold a single control', () => {
    const { main, more } = arrangeControls(undefined, [...many(3), ...many(1, 'more')]);
    expect(ids(main)).toEqual(['main0', 'main1', 'main2', 'more0']);
    expect(more).toHaveLength(0);
  });

  it('keeps Altro with two', () => {
    const { main, more } = arrangeControls(undefined, [...many(3), ...many(2, 'more')]);
    expect(main).toHaveLength(3);
    expect(more).toHaveLength(2);
  });

  it('a sensor has Period and Values as two shortcuts, with no Altro', () => {
    const { main, more } = arrangeControls('sensor', [big('values', { place: undefined, looks: ['rows'] } as Partial<PanelControl>), big('period', { place: undefined, looks: ['chart'] } as Partial<PanelControl>)]);
    expect(ids(main)).toEqual(['period', 'values']);
    expect(more).toHaveLength(0);
  });

  it('reads place, look and order from the defaults, and what the user chooses comes first', () => {
    const controls = [big('modes', { place: undefined, looks: ['tiles', 'list'] } as Partial<PanelControl>), big('humidity', { place: undefined, looks: ['slider'] } as Partial<PanelControl>), big('swing', { place: undefined, looks: ['list'] } as Partial<PanelControl>)];
    const standard = arrangeControls('climate', controls);
    expect(ids(standard.main)).toEqual(['modes']);
    expect(ids(standard.more)).toEqual(['swing', 'humidity']);
    expect(standard.main[0].look).toBe('tiles');
    const chosen = arrangeControls('climate', controls, { modes: { look: 'list' }, humidity: { place: 'main', order: -1 }, swing: { place: 'hidden' } });
    expect(ids(chosen.main)).toEqual(['humidity', 'modes']);
    expect(chosen.main[1].look).toBe('list');
    expect(chosen.more).toHaveLength(0);
  });

  it('keeps a look the control can take, or falls back on the first it has', () => {
    const { main } = arrangeControls('climate', [big('modes', { looks: ['list'] } as Partial<PanelControl>)]);
    expect(main[0].look).toBe('list');
  });

  it('gives every default a place, and every control but those of a row without shortcuts a look', () => {
    for (const rows of Object.values(PANEL_CONTROLS)) {
      for (const entry of rows as readonly { place: string }[]) expect(['main', 'more', 'hidden']).toContain(entry.place);
    }
    for (const name of ['light', 'plug', 'climate', 'stove', 'fan', 'humidifier', 'camera', 'vacuum', 'sensor'] as const) {
      for (const entry of PANEL_CONTROLS[name] as readonly { look?: string }[]) expect(entry.look).toBeTruthy();
    }
  });
});

describe('on a phone', () => {
  it('an action acts and leaves the centre as it is', () => {
    const onPress = vi.fn();
    draw(spec([big('modes'), action('align', onPress)]));
    fireEvent.click(row().getByRole('button', { name: 'align' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('protagonista').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Obiettivo 21°' })).toBeNull();
  });

  it('a control puts its large version in the centre; the pill and touching it again go back', () => {
    draw(spec([big('modes'), action('align')]));
    fireEvent.click(row().getByRole('button', { name: 'modes' }));
    expect(screen.getByText('grande modes tiles')).toBeTruthy();
    expect(screen.queryByText('protagonista')).toBeNull();
    expect(row().getByRole('button', { name: 'modes' }).className).toContain('is-selected');
    fireEvent.click(screen.getByRole('button', { name: 'Obiettivo 21°' }));
    expect(screen.getByText('protagonista')).toBeTruthy();
    fireEvent.click(row().getByRole('button', { name: 'modes' }));
    expect(screen.getByText('grande modes tiles')).toBeTruthy();
    fireEvent.click(row().getByRole('button', { name: 'modes' }));
    expect(screen.getByText('protagonista')).toBeTruthy();
  });

  it('has no row when the device says so', () => {
    draw(spec([big('modes')], { noRow: true }));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByText('gruppo modes')).toBeTruthy();
  });
});

describe('Altro', () => {
  const withMore = () => spec([big('modes', { place: 'main' }), big('one', { place: 'more', value: '40%', kindName: 'Livello' }), big('two', { place: 'more' }), action('three')]);

  it('lists what is in it, with the small word and the value', () => {
    draw(withMore());
    expect(row().queryByRole('button', { name: 'one' })).toBeNull();
    fireEvent.click(row().getByRole('button', { name: 'Altro' }));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Altro' })).toBeTruthy();
    const line = screen.getByRole('button', { name: /one/ });
    expect(line.textContent).toContain('Livello');
    expect(line.textContent).toContain('40%');
  });

  it('opens a control at full size inside the page, and Back returns to the list', () => {
    draw(withMore());
    fireEvent.click(row().getByRole('button', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('button', { name: /two/ }));
    expect(screen.getByText('grande two tiles')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'two' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Altro' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  it('runs an action from its row, and stays on the list', () => {
    const onPress = vi.fn();
    draw(spec([big('modes', { place: 'main' }), big('one', { place: 'more' }), { ...action('three', onPress), place: 'more' }]));
    fireEvent.click(row().getByRole('button', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('button', { name: /three/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 3, name: 'Altro' })).toBeTruthy();
  });
});

describe('the groups of the column and of the dialog', () => {
  it('follow the order of the main controls, and an action is a button', () => {
    const onPress = vi.fn();
    const { container } = draw(spec([big('b', { place: 'main' }), { ...action('a', onPress), place: 'main' }]));
    const titles = [...container.querySelectorAll('.panel-group-head > b')].map((node) => node.textContent);
    expect(titles).toEqual(['b', 'a']);
    fireEvent.click(screen.getByRole('button', { name: 'Fai a' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('have the row of Altro only when something is in it, last, with its values in view', () => {
    const { container, unmount } = draw(spec([big('a', { place: 'main' }), big('b', { place: 'main' })]));
    expect(container.querySelector('.panel-group-more')).toBeNull();
    unmount();
    const drawn = draw(spec([big('a', { place: 'main' }), big('one', { place: 'more', value: '40%' }), big('two', { place: 'more', value: 'Acceso' })]));
    const rows = [...drawn.container.querySelectorAll('.panel-groups > *')];
    const last = rows[rows.length - 1];
    expect(last.className).toContain('panel-group-more');
    expect(last.textContent).toContain('2 controlli');
    expect(last.textContent).toContain('one 40% · two Acceso');
    fireEvent.click(last);
    expect(screen.getByRole('heading', { level: 3, name: 'Altro' })).toBeTruthy();
  });
});
