import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { GridEngineLab } from './GridEngineLab';
import type { GridEngineDraftReviewContext } from './gridEngineDraftChangeSet';

afterEach(cleanup);

const reviewSourceIdentity = {
  editSessionId: 'edit-test',
  draftFingerprint: 'draft-test',
  inventoryFingerprint: 'inventory-test',
  structuralGeneration: 1,
  structuralRevision: 1,
  structuralFingerprint: 'snapshot-test',
} as const;

const draftReview: GridEngineDraftReviewContext = {
  sourceIdentity: reviewSourceIdentity,
  currentSourceIdentity: reviewSourceIdentity,
  inventory: [
    { id: 'move-a', title: 'Move A', role: 'root-widget' },
    { id: 'target-b', title: 'Target B', role: 'root-widget' },
    { id: 'side-c', title: 'Side C', role: 'root-widget' },
  ],
  breakpoints: {
    '2xl': { origin: 'editor-effective', baselineState: 'complete' },
    xl: { origin: 'editor-effective', baselineState: 'complete' },
    lg: { origin: 'editor-effective', baselineState: 'complete' },
    md: { origin: 'editor-effective', baselineState: 'complete' },
    sm: { origin: 'editor-effective', baselineState: 'complete' },
    xs: { origin: 'editor-effective', baselineState: 'complete' },
  },
  authority: { source: 'structural-policy-v1', renderingAuthority: 'not-authorized' },
};

function expectGeometry(
  testId: string,
  expected: Partial<Record<'x' | 'y' | 'w' | 'h', number>>,
) {
  const card = screen.getByTestId(testId);
  for (const [field, value] of Object.entries(expected)) {
    expect(card.getAttribute(`data-${field}`)).toBe(String(value));
  }
}

describe('GridEngineLab', () => {
  it('reviews exact changes while keeping draft apply and HA save unavailable', () => {
    render(<GridEngineLab presentation="editor-preview" draftReview={draftReview} />);

    fireEvent.click(screen.getByTestId('review-draft-changes'));
    expect(screen.getByTestId('draft-review-no-changes')).toBeDefined();
    expect(screen.getByTestId('draft-applicability-status').textContent).toBe('no-changes');

    fireEvent.click(screen.getByTestId('review-draft-changes'));
    fireEvent.change(screen.getByLabelText('Destinazione X'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Destinazione Y'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    fireEvent.click(screen.getByTestId('review-draft-changes'));

    expect(screen.getByTestId('draft-change-xl-move-a')).toBeDefined();
    expect(screen.getByTestId('draft-applicability-status').textContent).toBe('blocked-no-authority');
    expect(screen.getByText('Applica al draft dell’editor')).toBeDefined();
    expect(screen.getByText('Salva su Home Assistant')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Applica al draft/ })).toBeNull();
  });

  it('keeps authentic content inert while the Grid Engine surface owns selection', () => {
    const operationalClick = vi.fn();
    render(
      <GridEngineLab
        renderItem={({ item }) => <button type="button" onClick={operationalClick}>Operativo {item.i}</button>}
      />,
    );

    const editingSurface = screen.getByTestId('experimental-real-card-move-a');
    const visualBoundary = screen.getByTestId('experimental-real-card-content-move-a');
    expect(visualBoundary.hasAttribute('inert')).toBe(true);
    expect(visualBoundary.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(editingSurface);
    expect(operationalClick).not.toHaveBeenCalled();
    expect(screen.getByTestId('experimental-before-diagnostics').hasAttribute('open')).toBe(false);
  });

  it('shows profile, effective breakpoint, columns, mode, and generated provenance', () => {
    render(<GridEngineLab />);

    expect(screen.getByTestId('responsive-profile').textContent).toBe('Desktop');
    expect(screen.getByTestId('responsive-breakpoint').textContent).toBe('xl');
    expect(screen.getByTestId('responsive-cols').textContent).toBe('12');
    expect(screen.getByTestId('responsive-origin').textContent).toBe('Generated');
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('manual');

    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint sm' }));
    expect(screen.getByTestId('responsive-profile').textContent).toBe('Tablet');
    expect(screen.getByTestId('responsive-breakpoint').textContent).toBe('sm');
    expect(screen.getByTestId('responsive-canvas-width').textContent).toBe('640px');
    expect(screen.getByTestId('responsive-cols').textContent).toBe('4');
  });

  it('offers seven deterministic scenarios and keeps automatic geometry as the editable manual draft', () => {
    render(<GridEngineLab />);

    expect(screen.getAllByText(/Scenario 0[1-7]/)).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    expectGeometry('result-card-gap-a', { x: 0, y: 0, w: 2, h: 1 });
    expectGeometry('result-card-gap-b', { x: 0, y: 4, w: 2, h: 1 });
    expectGeometry('result-card-gap-c', { x: 0, y: 6, w: 2, h: 1 });
    expect(screen.getByTestId('mode-effect').textContent).toContain('spazi non coinvolti');

    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    expectGeometry('result-card-gap-a', { x: 0, y: 0 });
    expectGeometry('result-card-gap-b', { x: 0, y: 1 });
    expectGeometry('result-card-gap-c', { x: 0, y: 2 });
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('automatic');
    expect(screen.getByTestId('mode-effect').textContent).toContain('COMPACT: 2 geometrie');

    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    expectGeometry('result-card-gap-b', { x: 0, y: 1 });
    expectGeometry('result-card-gap-c', { x: 0, y: 2 });
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('manual');
    expect(screen.getByTestId('draft-status').textContent).toBe('Unconfirmed changes');
  });

  it('previews explicit COMPACT and directional REORDER as distinct operations', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compatta layout' }));
    expectGeometry('result-card-gap-b', { y: 1 });
    expectGeometry('result-card-gap-c', { y: 2 });
    expect(screen.getByText('COMPACT', { selector: 'dd' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Collisione a catena/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona chain-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    fireEvent.change(screen.getByLabelText('Destinazione Y'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));

    expectGeometry('result-card-chain-b', { y: 0 });
    expectGeometry('result-card-chain-c', { y: 1 });
    expectGeometry('result-card-chain-a', { y: 2 });
    expectGeometry('result-card-mover', { y: 5 });
    expect(screen.getByTestId('final-selected-position').textContent).toContain('chain-a · x0 y2');
  });

  it('commits the exact MOVE preview without a second repositioning', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 1, w: 4, h: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Conferma in memoria' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 1, w: 4, h: 2 });
    expectGeometry('reference-card-target-b', { x: 0, y: 1, w: 4, h: 2 });
    expect(screen.getByRole('button', { name: 'Conferma in memoria' }).hasAttribute('disabled')).toBe(true);
  });

  it('makes the three-card collision chain visible in both solver modes', () => {
    render(<GridEngineLab />);

    const loadChain = () => fireEvent.click(screen.getByRole('button', { name: /Collisione a catena/ }));
    const expectChain = () => {
      expectGeometry('result-card-mover', { x: 0, y: 0 });
      expectGeometry('result-card-chain-a', { x: 0, y: 1 });
      expectGeometry('result-card-chain-b', { x: 0, y: 2 });
      expectGeometry('result-card-chain-c', { x: 0, y: 3 });
    };

    loadChain();
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectChain();

    loadChain();
    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expectChain();
  });

  it('uses RESIZE to push partially overlapping neighbors', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: 'Seleziona target-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }));
    fireEvent.change(screen.getByLabelText('Larghezza W'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Altezza H'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));

    expectGeometry('result-card-target-b', { x: 0, y: 0, w: 8, h: 2 });
    expectGeometry('result-card-side-c', { x: 6, y: 2, w: 4, h: 1 });
  });

  it('derives runtime expansion from the reference and restores it exactly when disabled', () => {
    render(<GridEngineLab />);

    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
    fireEvent.click(screen.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }));
    expectGeometry('result-card-move-a', { x: 7, y: 3, w: 5, h: 2 });
    expectGeometry('reference-card-move-a', { x: 8, y: 3, w: 4, h: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }));
    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
  });

  it('reports solver validation errors and reset restores the selected fixture', () => {
    render(<GridEngineLab />);

    fireEvent.change(screen.getByLabelText('Destinazione X'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expect(screen.getByRole('alert').textContent).toContain('INVALID_NUMBER');

    fireEvent.change(screen.getByLabelText('Destinazione X'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma in memoria' }));
    expectGeometry('result-card-move-a', { x: 0, y: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Reset fixture' }));
    expectGeometry('result-card-move-a', { x: 8, y: 3, w: 4, h: 1 });
    expectGeometry('result-card-target-b', { x: 0, y: 0, w: 4, h: 2 });
  });

  it('supports undo, redo, confirmation, and draft reset entirely in lab memory', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    expectGeometry('result-card-gap-b', { y: 1 });
    expectGeometry('reference-card-gap-b', { y: 4 });
    expect(screen.getByTestId('draft-status').textContent).toBe('Unconfirmed changes');

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expectGeometry('result-card-gap-b', { y: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina' }));
    expectGeometry('result-card-gap-b', { y: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Conferma in memoria' }));
    expectGeometry('reference-card-gap-b', { y: 1 });
    expect(screen.getByTestId('draft-status').textContent).toContain('Saved in lab');

    fireEvent.click(screen.getByRole('button', { name: 'manual' }));
    expect(screen.getByTestId('draft-status').textContent).toBe('Unconfirmed changes');
    fireEvent.click(screen.getByRole('button', { name: 'Reset preview' }));
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('automatic');
    expectGeometry('result-card-gap-b', { y: 1 });
  });

  it('keeps an explicit XS manual override independent while switching to XL and back', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Spazi manuali/ }));
    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint xs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crea override manuale XS' }));
    expect(screen.getByTestId('effective-mode').textContent).toContain('manual');
    expect(screen.getByTestId('override-status').textContent).toContain('manual');

    fireEvent.click(screen.getByRole('button', { name: 'Seleziona gap-c' }));
    fireEvent.change(screen.getByLabelText('Destinazione Y'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma in memoria' }));
    expectGeometry('result-card-gap-c', { y: 7 });

    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint xl' }));
    expect(screen.getByTestId('effective-mode').textContent).toContain('automatic');
    expectGeometry('result-card-gap-c', { y: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint xs' }));
    expect(screen.getByTestId('effective-mode').textContent).toContain('manual');
    expectGeometry('result-card-gap-c', { y: 7 });
  });

  it('keeps a missing breakpoint explicitly synthetic and non-confirmable', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Breakpoint mancante/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint 2xl' }));
    expect(screen.getByTestId('responsive-origin').textContent).toBe('Missing');
    expect(screen.queryByTestId('result-card-missing-a')).toBeNull();
    expect(screen.getByTestId('missing-breakpoint-status').textContent).toContain('nessuna baseline');

    fireEvent.click(screen.getByRole('button', { name: 'Deriva preview sintetica non persistita' }));
    expectGeometry('result-card-missing-a', { x: 0, y: 0, w: 4, h: 1 });
    expect(screen.getByTestId('missing-breakpoint-status').textContent).toContain('non pu');
    expect(screen.getByRole('button', { name: 'Conferma in memoria' }).hasAttribute('disabled')).toBe(true);
  });

  it('represents Light, special section, and Stack root while restoring runtime height exactly', () => {
    render(<GridEngineLab />);

    fireEvent.click(screen.getByRole('button', { name: /Light, Stack e sezioni/ }));
    expect(screen.getByTestId('result-card-widget-standard').getAttribute('data-item-kind')).toBe('widget');
    expect(screen.getByTestId('result-card-light-dynamic').getAttribute('data-item-kind')).toBe('light');
    expect(screen.getByTestId('result-card-special-section').getAttribute('data-item-kind')).toBe('special-section');
    expect(screen.getByTestId('result-card-stack-root').getAttribute('data-item-kind')).toBe('stack-root');
    expectGeometry('reference-card-light-dynamic', { w: 4, h: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }));
    expectGeometry('result-card-light-dynamic', { w: 5, h: 2 });
    expectGeometry('reference-card-light-dynamic', { w: 4, h: 1 });
    expect(screen.getByTestId('preview-validation').textContent).toContain('collisions=0 / out=0');

    fireEvent.click(screen.getByRole('button', { name: /Simula espansione Light \/ dispositivo/ }));
    expectGeometry('result-card-light-dynamic', { w: 4, h: 1 });
    expectGeometry('reference-card-light-dynamic', { w: 4, h: 1 });
  });

  it('reuses the laboratory as a single isolated editor snapshot at the captured breakpoint', () => {
    render(
      <GridEngineLab
        presentation="editor-preview"
        initialBreakpoint="xs"
        context={<p>Baseline editor non autorevole</p>}
        scenarios={[{
          id: 'editor-snapshot',
          title: 'Configurazione visualizzata',
          eyebrow: 'Editor DEV',
          description: 'Snapshot isolata',
          sourceCols: 12,
          selectedId: 'editor-light',
          suggestedMove: { x: 0, y: 0 },
          items: [
            { i: 'editor-light', x: 6, y: 4, w: 3, h: 1 },
            { i: 'editor-stack', x: 0, y: 0, w: 6, h: 3 },
          ],
          initialLayouts: {
            xs: [
              { i: 'editor-light', x: 1, y: 5, w: 1, h: 1 },
              { i: 'editor-stack', x: 0, y: 0, w: 2, h: 3 },
            ],
          },
          missingBreakpoints: ['2xl', 'xl', 'lg', 'md', 'sm'],
          itemKinds: { 'editor-light': 'light', 'editor-stack': 'stack-root' },
        }]}
      />,
    );

    expect(screen.getByText('Grid Engine 2.0 — Editor sperimentale')).toBeTruthy();
    expect(screen.getByText('Baseline editor non autorevole')).toBeTruthy();
    expect(screen.queryByText(/Scenario 01/)).toBeNull();
    expect(screen.getByTestId('responsive-breakpoint').textContent).toBe('xs');
    expectGeometry('result-card-editor-light', { x: 1, y: 5, w: 1, h: 1 });
    expectGeometry('result-card-editor-stack', { x: 0, y: 0, w: 2, h: 3 });
    expect(screen.getByTestId('draft-status').textContent).toContain('Snapshot isolata');

    fireEvent.click(screen.getByRole('button', { name: 'automatic' }));
    expect(screen.getByTestId('draft-status').textContent).toBe('Unconfirmed changes');
    fireEvent.click(screen.getByRole('button', { name: 'Reset anteprima' }));
    expect(screen.getByTestId('solver-mode-status').textContent).toBe('manual');
    expectGeometry('result-card-editor-light', { y: 5 });
  });

  it('renders exact provisional breakpoint geometry while keeping it non-confirmable', () => {
    render(
      <GridEngineLab
        presentation="editor-preview"
        initialBreakpoint="md"
        scenarios={[{
          id: 'editor-provisional',
          title: 'Configurazione provvisoria',
          eyebrow: 'Editor DEV',
          description: 'Layout con ID legacy escluso',
          sourceCols: 12,
          selectedId: 'root-a',
          suggestedMove: { x: 0, y: 0 },
          items: [
            { i: 'root-a', x: 0, y: 0, w: 3, h: 1 },
            { i: 'root-b', x: 3, y: 0, w: 3, h: 1 },
          ],
          initialLayouts: {
            md: [
              { i: 'root-a', x: 0, y: 4, w: 2, h: 1 },
              { i: 'root-b', x: 2, y: 4, w: 2, h: 1 },
            ],
          },
          provisionalLayouts: {
            xs: [
              { i: 'root-a', x: 1, y: 12, w: 1, h: 1 },
              { i: 'root-b', x: 0, y: 15, w: 1, h: 1 },
            ],
          },
          breakpointStatus: {
            xs: {
              breakpoint: 'xs', cols: 2, state: 'incomplete', itemCount: 3, validItemCount: 2,
              missingIds: [], unknownIds: ['legacy.deleted'], invalidIds: [],
            },
          },
          missingBreakpoints: ['2xl'],
        }]}
      />,
    );

    expectGeometry('result-card-root-a', { x: 0, y: 4, w: 2, h: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Breakpoint xs' }));
    expect(screen.getByTestId('responsive-origin').textContent).toBe('Provisional');
    expect(screen.getByTestId('provisional-breakpoint-status').textContent).toContain('2 root validi');
    expectGeometry('reference-card-root-a', { x: 1, y: 12, w: 1, h: 1 });
    expectGeometry('result-card-root-b', { x: 0, y: 15, w: 1, h: 1 });

    fireEvent.change(screen.getByLabelText('Destinazione Y'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anteprima' }));
    expect(screen.getByRole('button', { name: 'Conferma in memoria' }).hasAttribute('disabled')).toBe(true);
  });
});
