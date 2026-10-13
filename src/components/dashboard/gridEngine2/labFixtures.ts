import type { GridLayoutItem } from './model';

export type GridEngineLabScenario = {
  readonly id: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly items: readonly GridLayoutItem[];
  readonly selectedId: string;
  readonly suggestedMove: Readonly<{ x: number; y: number }>;
};

export const GRID_ENGINE_LAB_COLS = 6;
export const GRID_ENGINE_LAB_ROW_HEIGHT = 58;
export const GRID_ENGINE_LAB_GAP = 6;

const RESPONSIVE_DENSITY_ITEMS: readonly GridLayoutItem[] = Array.from(
  { length: 30 },
  (_, index) => {
    const band = Math.floor(index / 3);
    const slot = index % 3;
    const x = slot * 2;
    const w = slot === 2 ? 2 : 1 + ((band + slot) % 2);
    return {
      i: `density-${String(index + 1).padStart(2, '0')}`,
      x,
      y: band * 3,
      w,
      h: index % 4 === 0 ? 2 : 1,
    };
  },
);

export const GRID_ENGINE_LAB_SCENARIOS: readonly GridEngineLabScenario[] = [
  {
    id: 'simple-collision',
    title: 'Collisione semplice',
    eyebrow: 'Scenario 01',
    description: 'MOVE-A entra nello spazio di TARGET-B, che viene spinto verso il basso.',
    selectedId: 'move-a',
    suggestedMove: { x: 0, y: 0 },
    items: [
      { i: 'move-a', x: 4, y: 3, w: 2, h: 1 },
      { i: 'target-b', x: 0, y: 0, w: 2, h: 2 },
      { i: 'side-c', x: 3, y: 0, w: 2, h: 1 },
    ],
  },
  {
    id: 'chain-collision',
    title: 'Collisione a catena',
    eyebrow: 'Scenario 02',
    description: 'CHAIN-A, CHAIN-B e CHAIN-C scendono in sequenza dopo il movimento.',
    selectedId: 'mover',
    suggestedMove: { x: 0, y: 0 },
    items: [
      { i: 'mover', x: 5, y: 5, w: 1, h: 1 },
      { i: 'chain-a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'chain-b', x: 0, y: 1, w: 1, h: 1 },
      { i: 'chain-c', x: 0, y: 2, w: 1, h: 1 },
      { i: 'observer', x: 3, y: 0, w: 2, h: 2 },
    ],
  },
  {
    id: 'manual-gaps',
    title: 'Spazi manuali',
    eyebrow: 'Scenario 03',
    description: 'A y=0, B y=4 e C y=6 restano distanziate in Manual e diventano 0, 1, 2 in Automatic.',
    selectedId: 'gap-a',
    suggestedMove: { x: 0, y: 0 },
    items: [
      { i: 'gap-a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'gap-b', x: 0, y: 4, w: 1, h: 1 },
      { i: 'gap-c', x: 0, y: 6, w: 1, h: 1 },
    ],
  },
  {
    id: 'mixed-sizes',
    title: 'Dimensioni differenti',
    eyebrow: 'Scenario 04',
    description: 'Larghezze parzialmente sovrapposte e altezze diverse producono una catena mista.',
    selectedId: 'mixed-mover',
    suggestedMove: { x: 1, y: 0 },
    items: [
      { i: 'mixed-mover', x: 4, y: 6, w: 2, h: 2 },
      { i: 'wide', x: 1, y: 0, w: 3, h: 1 },
      { i: 'tall', x: 2, y: 1, w: 1, h: 2 },
      { i: 'edge', x: 4, y: 0, w: 2, h: 3 },
      { i: 'small', x: 1, y: 4, w: 2, h: 1 },
    ],
  },
  {
    id: 'responsive-density',
    title: 'Densità responsive',
    eyebrow: 'Scenario 05',
    description: 'Trenta card con dimensioni miste per verificare derivazione e rendering.',
    selectedId: 'density-01',
    suggestedMove: { x: 0, y: 1 },
    items: RESPONSIVE_DENSITY_ITEMS,
  },
] as const;

export function cloneLabLayout(items: readonly GridLayoutItem[]) {
  return items.map((item) => ({ ...item }));
}
