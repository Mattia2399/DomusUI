import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GridStructuralAdoptionPanel,
  type GridStructuralAdoptionPanelProps,
} from './GridStructuralAdoptionPanel';

afterEach(cleanup);

const sourceIdentity = {
  editSessionId: 'edit-panel-1',
  draftFingerprint: 'draft-panel-1',
  inventoryFingerprint: 'inventory-panel-1',
  structuralGeneration: 4,
  structuralRevision: 84,
  structuralFingerprint: 'structural-panel-1',
} as const;

const geometry = [
  { i: 'root.light', x: 0, y: 0, w: 2, h: 2 },
  { i: 'section.scenes', x: 2, y: 0, w: 2, h: 2 },
] as const;

function props(override: Partial<GridStructuralAdoptionPanelProps> = {}): GridStructuralAdoptionPanelProps {
  return {
    sourceIdentity,
    currentSourceIdentity: sourceIdentity,
    inventory: [
      {
        id: 'root.light', title: 'Luce', kind: 'light', role: 'root-widget', parentId: null,
        constraints: { minW: 1, maxW: 4, minH: 1, maxH: 4 },
      },
      {
        id: 'section.scenes', title: 'Scene', kind: 'scenes', role: 'special-section', parentId: null,
        constraints: { minW: 1, maxW: 4, minH: 1, maxH: 4 },
      },
    ],
    legacyExtraIds: [],
    breakpoints: [
      {
        breakpoint: 'sm', cols: 4, baselineState: 'complete', geometrySource: 'editor-effective',
        operationalGeometry: geometry, draftExplicitGeometry: geometry, persistedExplicitGeometry: geometry,
      },
      {
        breakpoint: '2xl', cols: 12, baselineState: 'missing', geometrySource: 'missing',
        operationalGeometry: geometry, draftExplicitGeometry: null, persistedExplicitGeometry: null,
      },
    ],
    initialBreakpoint: 'sm',
    ...override,
  };
}

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Prepara adozione layout' }));
}

function prepare() {
  fireEvent.click(screen.getByTestId('prepare-grid-structural-adoption'));
}

describe('GridStructuralAdoptionPanel', () => {
  it('opens on demand and exposes the geometry acquired at session opening', () => {
    render(<GridStructuralAdoptionPanel {...props()} />);

    expect(screen.queryByTestId('grid-structural-adoption-content')).toBeNull();
    openPanel();

    expect(screen.getByTestId('grid-adoption-source-preview').textContent).toContain('root.light: x0 y0 w2 h2');
    expect(screen.getByText('2 root inventariati')).toBeTruthy();
    expect((screen.getByLabelText('Seleziona SM') as HTMLInputElement).checked).toBe(true);
  });

  it('selects independent breakpoints and keeps a real Missing breakpoint empty', () => {
    render(<GridStructuralAdoptionPanel {...props()} />);
    openPanel();
    fireEvent.click(screen.getByLabelText('Seleziona SM'));
    fireEvent.click(screen.getByLabelText('Seleziona 2XL'));
    prepare();

    const breakpoint = screen.getByTestId('grid-adoption-breakpoint-2xl');
    expect(breakpoint.textContent).toContain('blocked-missing');
    expect(breakpoint.textContent).toContain('candidato: missing');
    expect(breakpoint.textContent).toContain('Missing');
  });

  it('prepares, explicitly acknowledges, and discards an in-memory candidate without Apply', () => {
    render(<GridStructuralAdoptionPanel {...props()} />);
    openPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Automatic' }));
    prepare();

    expect(screen.getByTestId('grid-adoption-lifecycle').textContent).toContain('Candidato preparato in memoria');
    expect(screen.getByTestId('grid-adoption-authorization').textContent).toContain('Applicazione non autorizzata');
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.getByTestId('grid-adoption-breakpoint-sm').textContent).toContain('Sorgente operativa');
    expect(screen.getByTestId('grid-adoption-breakpoint-sm').textContent).toContain('Candidato');

    fireEvent.click(screen.getByTestId('acknowledge-grid-structural-adoption'));
    expect(screen.getByTestId('grid-adoption-lifecycle').textContent).toContain('Candidato esaminato in memoria');
    expect(screen.getByTestId('grid-adoption-authorization').textContent).toContain('Applicazione non autorizzata');

    fireEvent.click(screen.getByTestId('discard-grid-structural-adoption'));
    expect(screen.queryByTestId('grid-structural-adoption-candidate')).toBeNull();
    expect(screen.getByTestId('prepare-grid-structural-adoption')).toBeTruthy();
  });

  it('invalidates the staged candidate when source identity changes', () => {
    const view = render(<GridStructuralAdoptionPanel {...props()} />);
    openPanel();
    prepare();

    view.rerender(<GridStructuralAdoptionPanel {...props({
      currentSourceIdentity: { ...sourceIdentity, inventoryFingerprint: 'inventory-panel-2' },
    })} />);

    expect(screen.getByTestId('grid-adoption-lifecycle').textContent).toContain('Candidato invalidato');
    expect(screen.getByText('INVENTORY_CHANGED')).toBeTruthy();
    expect(screen.queryByTestId('acknowledge-grid-structural-adoption')).toBeNull();
  });

  it('does not retain staging after unmount/reopen and performs no storage writes', () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    const view = render(<GridStructuralAdoptionPanel {...props()} />);
    openPanel();
    prepare();
    expect(screen.getByTestId('grid-structural-adoption-candidate')).toBeTruthy();

    view.unmount();
    render(<GridStructuralAdoptionPanel {...props()} />);
    openPanel();

    expect(screen.queryByTestId('grid-structural-adoption-candidate')).toBeNull();
    expect(localWrite).not.toHaveBeenCalled();
    localWrite.mockRestore();
  });
});
