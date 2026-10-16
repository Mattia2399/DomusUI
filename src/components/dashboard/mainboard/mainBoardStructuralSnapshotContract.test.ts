import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainBoard = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/MainBoard.tsx'),
  'utf8',
);
const gridCanvas = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/GridCanvas.tsx'),
  'utf8',
);

describe('MainBoard authoritative structural snapshot integration', () => {
  it('verifies the candidate in a post-commit layout effect before acknowledging it', () => {
    expect(mainBoard).toContain('useLayoutEffect(() => {');
    expect(mainBoard).toContain('createDashboardStructuralApplicationReceipt(');
    expect(mainBoard).toContain('acknowledgeStructuralApplication(receipt)');
    expect(mainBoard.indexOf('createDashboardStructuralApplicationReceipt('))
      .toBeLessThan(mainBoard.indexOf('acknowledgeStructuralApplication(receipt)'));
  });

  it('passes the read-only snapshot separately from the renderer layouts', () => {
    expect(mainBoard).toContain('responsiveLayouts={responsiveLayouts}');
    expect(mainBoard).toContain('structuralLoadSnapshot={haDashboardLayoutPersistence.structuralLoadSnapshot}');
    expect(gridCanvas).toContain('const structuralDashboard = structuralLoadSnapshot.dashboard;');
    expect(gridCanvas).toContain('legacyRuntimeInput: liveGridEngineLayouts');
    expect(gridCanvas).not.toContain('explicitRootLayouts = responsiveLayouts.root');
  });
});
