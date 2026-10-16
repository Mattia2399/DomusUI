import { describe, expect, it } from 'vitest';
import type { Widget } from '../types/dashboardModels';
import type { DashboardLayoutConfiguration } from './dashboardConfigurationRepository';
import {
  acknowledgeDashboardStructuralApplication,
  createDashboardStructuralCandidate,
  createDashboardStructuralApplicationReceipt,
  createDashboardStructuralSnapshotFingerprint,
  createEmptyDashboardStructuralLoadSnapshot,
  createLocalDashboardStructuralLoadSnapshot,
  isDashboardStructuralSnapshotAuthoritative,
  markDashboardStructuralDocumentMissing,
  markDashboardStructuralLoadPhase,
} from './dashboardStructuralLoadSnapshot';

function dashboard(title = 'Server', widgetCount = 1): DashboardLayoutConfiguration {
  const widgets: Widget[] = Array.from({ length: widgetCount }, (_, index) => ({
    id: `light-${index}`,
    kind: 'light',
    title: `${title} ${index}`,
    entityId: `light.example_${index}`,
    status: 'on',
    isOn: true,
    layout: { i: `light-${index}`, x: index, y: 0, w: 1, h: 2 },
  }));
  return {
    storageVersion: 14,
    sections: [],
    widgets,
    widgetTypeLayoutOverrides: { light: { xl: { hOff: 1, hOn: 2 } } },
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: {
        xl: widgets.map((widget, index) => ({ i: widget.id, x: index, y: 0, w: 1, h: 1 })),
      },
    },
  };
}

function receiptFor(candidate: ReturnType<typeof createDashboardStructuralCandidate>) {
  return {
    ...candidate.token,
    expectedAppliedFingerprint: candidate.token.fingerprint,
    appliedFingerprint: candidate.token.fingerprint,
    coherent: true,
  };
}

describe('authoritative dashboard structural snapshot contract', () => {
  it('1. labels the initial browser dashboard as provisional local cache', () => {
    const snapshot = createLocalDashboardStructuralLoadSnapshot(dashboard('Local', 22), 'loading');
    expect(snapshot).toMatchObject({
      phase: 'loading', source: 'local-cache', generation: 0, revision: null, coherent: false,
    });
    expect(snapshot.dashboard?.widgets).toHaveLength(22);
  });

  it('2. starts with no authority when there is no active real-dashboard load', () => {
    expect(createEmptyDashboardStructuralLoadSnapshot()).toEqual({
      phase: 'idle',
      source: 'none',
      generation: 0,
      revision: null,
      storageVersion: null,
      fingerprint: null,
      coherent: false,
      dashboard: null,
    });
  });

  it('3. creates a new HA generation without mixing the local 22 roots with 21 server roots', () => {
    const local = createLocalDashboardStructuralLoadSnapshot(dashboard('Local', 22));
    const candidate = createDashboardStructuralCandidate(local, dashboard('HA', 21), 84, 'loading');
    expect(candidate.snapshot).toMatchObject({
      source: 'home-assistant', generation: 1, revision: 84, coherent: false,
    });
    expect(candidate.snapshot.dashboard?.widgets).toHaveLength(21);
  });

  it('4. does not mark an HA candidate complete before a React receipt', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 1, 'loading',
    );
    expect(candidate.snapshot.phase).toBe('loading');
    expect(isDashboardStructuralSnapshotAuthoritative(candidate.snapshot)).toBe(false);
  });

  it('5. accepts a coherent receipt for the same generation, revision and fingerprint', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 1, 'loading',
    );
    const complete = acknowledgeDashboardStructuralApplication(candidate.snapshot, receiptFor(candidate));
    expect(complete).toMatchObject({ phase: 'complete', coherent: true, revision: 1 });
    expect(isDashboardStructuralSnapshotAuthoritative(complete!)).toBe(true);
  });

  it('6. rejects a receipt with different applied structural data', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 1, 'loading',
    );
    expect(acknowledgeDashboardStructuralApplication(candidate.snapshot, {
      ...receiptFor(candidate), appliedFingerprint: 'dsl-v1-different',
    })).toBeNull();
  });

  it('7. rejects a receipt from an obsolete generation', () => {
    const first = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard('One'), 1, 'loading',
    );
    const second = createDashboardStructuralCandidate(first.snapshot, dashboard('Two'), 2, 'refreshing');
    expect(acknowledgeDashboardStructuralApplication(second.snapshot, receiptFor(first))).toBeNull();
  });

  it('8. treats a valid empty HA dashboard as completable authority', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard('Empty', 0), 5, 'loading',
    );
    const complete = acknowledgeDashboardStructuralApplication(candidate.snapshot, receiptFor(candidate));
    expect(complete?.dashboard?.widgets).toEqual([]);
    expect(complete?.phase).toBe('complete');
  });

  it('9. distinguishes a missing HA document from a valid empty dashboard', () => {
    const missing = markDashboardStructuralDocumentMissing(
      createLocalDashboardStructuralLoadSnapshot(dashboard('Local')),
      'migration-required',
      'home-assistant-document-missing',
    );
    expect(missing).toMatchObject({ source: 'none', dashboard: null, revision: null });
    expect(missing.phase).toBe('migration-required');
  });

  it('10. represents a read-only user with no document as empty, not complete', () => {
    const missing = markDashboardStructuralDocumentMissing(
      createEmptyDashboardStructuralLoadSnapshot(), 'empty', 'home-assistant-document-missing',
    );
    expect(missing.phase).toBe('empty');
    expect(isDashboardStructuralSnapshotAuthoritative(missing)).toBe(false);
  });

  it('11. keeps the applied revision but revokes completeness while a remote revision is pending', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard('Current'), 4, 'loading',
    );
    const complete = acknowledgeDashboardStructuralApplication(candidate.snapshot, receiptFor(candidate))!;
    const pending = markDashboardStructuralLoadPhase(complete, 'pending-remote', 'draft');
    expect(pending).toMatchObject({ phase: 'pending-remote', revision: 4, coherent: false });
    expect(pending.dashboard).toBe(complete.dashboard);
  });

  it('12. does not increment the generation for an unchanged authoritative reread', () => {
    const first = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 7, 'loading',
    );
    const complete = acknowledgeDashboardStructuralApplication(first.snapshot, receiptFor(first))!;
    const reread = createDashboardStructuralCandidate(complete, dashboard(), 7, 'refreshing');
    expect(reread.changed).toBe(false);
    expect(reread.snapshot).toBe(complete);
    expect(reread.token.generation).toBe(1);
  });

  it('13. increments once for a newer remote revision and isolates both generations', () => {
    const first = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard('One'), 1, 'loading',
    );
    const second = createDashboardStructuralCandidate(first.snapshot, dashboard('Two'), 2, 'refreshing');
    expect(second.token.generation).toBe(2);
    expect(first.snapshot.dashboard?.widgets[0]?.title).toBe('One 0');
    expect(second.snapshot.dashboard?.widgets[0]?.title).toBe('Two 0');
    expect(first.snapshot.dashboard).not.toBe(second.snapshot.dashboard);
  });

  it('14. recursively freezes nested structural objects', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 1, 'loading',
    );
    expect(Object.isFrozen(candidate.snapshot.dashboard)).toBe(true);
    expect(Object.isFrozen(candidate.snapshot.dashboard?.widgets)).toBe(true);
    expect(Object.isFrozen(candidate.snapshot.dashboard?.widgets[0]?.layout)).toBe(true);
    expect(() => {
      candidate.snapshot.dashboard!.widgets[0]!.layout.x = 99;
    }).toThrow();
  });

  it('15. strips device runtime fields and legacy local secrets', () => {
    const withSecret = dashboard();
    (withSecret.widgets[0] as Widget & { lockCode: string }).lockCode = '1234';
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), withSecret, 1, 'loading',
    );
    expect(candidate.snapshot.dashboard?.widgets[0]).not.toHaveProperty('status');
    expect(candidate.snapshot.dashboard?.widgets[0]).not.toHaveProperty('isOn');
    expect(candidate.snapshot.dashboard?.widgets[0]).not.toHaveProperty('lockCode');
  });

  it('16. ignores Light runtime expansion and state changes in the structural fingerprint', () => {
    const off = dashboard();
    off.widgets[0]!.isOn = false;
    off.widgets[0]!.status = 'off';
    off.widgets[0]!.layout.h = 1;
    const on = dashboard();
    on.widgets[0]!.isOn = true;
    on.widgets[0]!.status = 'on';
    on.widgets[0]!.layout.h = 2;
    expect(createDashboardStructuralSnapshotFingerprint(on))
      .toBe(createDashboardStructuralSnapshotFingerprint(off));
  });

  it('17. preserves extra responsive IDs for read-only diagnostic classification', () => {
    const source = dashboard();
    source.responsiveLayouts.root!.xl!.push({ i: 'deleted-widget', x: 3, y: 0, w: 1, h: 1 });
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), source, 1, 'loading',
    );
    expect(candidate.snapshot.dashboard?.responsiveLayouts.root?.xl?.map((item) => item.i))
      .toContain('deleted-widget');
  });

  it('18. does not invent a missing 2XL structural layout', () => {
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), dashboard(), 1, 'loading',
    );
    expect(candidate.snapshot.dashboard?.responsiveLayouts.root?.['2xl']).toBeUndefined();
  });

  it.each([
    ['sections', (value: DashboardLayoutConfiguration) => {
      value.sections = [{ id: 'new-section', kind: 'stack-grid', layout: { i: 'new-section', x: 0, y: 0, w: 2, h: 2 } }];
    }],
    ['widgets', (value: DashboardLayoutConfiguration) => {
      value.widgets[0]!.parentSectionId = 'new-section';
    }],
    ['responsive layouts', (value: DashboardLayoutConfiguration) => {
      value.responsiveLayouts.root!.xl![0]!.x = 4;
    }],
  ])('19. marks a React receipt incoherent when %s differ', (_label, mutate) => {
    const source = dashboard();
    const candidate = createDashboardStructuralCandidate(
      createEmptyDashboardStructuralLoadSnapshot(), source, 1, 'loading',
    );
    const applied = structuredClone(source);
    mutate(applied);
    const receipt = createDashboardStructuralApplicationReceipt(candidate.snapshot, source, applied);
    expect(receipt?.coherent).toBe(false);
    expect(acknowledgeDashboardStructuralApplication(candidate.snapshot, receipt!)).toBeNull();
  });
});
