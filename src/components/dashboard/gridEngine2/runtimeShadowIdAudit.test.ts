import { describe, expect, it } from 'vitest';
import type { DashboardBreakpointLayouts } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import {
  auditRuntimeShadowIds,
  fingerprintRuntimeShadowId,
  type RuntimeShadowIdAuditInput,
} from './runtimeShadowIdAudit';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';
import { analyzeRuntimeShadow, type RuntimeShadowInput } from './runtimeShadowDiagnostics';

const widget = (id: string, kind = 'sensor'): RuntimeShadowRootElement => ({ id, role: 'widget', kind });
const section = (id: string, kind = 'greeting'): RuntimeShadowRootElement => ({ id, role: 'section', kind });
const stack = (id: string): RuntimeShadowRootElement => ({ id, role: 'stack', kind: 'stack-grid' });
const layout = (...ids: string[]): GridLayoutItem[] => ids.map((i, index) => ({
  i,
  x: index * 2,
  y: 0,
  w: 2,
  h: 1,
}));

function audit(overrides: Partial<RuntimeShadowIdAuditInput> = {}) {
  return auditRuntimeShadowIds({
    rootElements: [widget('alpha'), widget('beta')],
    explicitLayouts: { xs: layout('alpha', 'beta') },
    rendererLayouts: { xs: layout('alpha', 'beta') },
    ...overrides,
  });
}

describe('Runtime Shadow root ID audit', () => {
  it('1. accepts IDs present in structural, recognized and rendered sets', () => {
    const xs = audit().breakpoints.xs;
    expect(xs.structuralNotRecognized).toEqual([]);
    expect(xs.recognizedNotStructural).toEqual([]);
    expect(xs.recognizedNotRendered).toEqual([]);
    expect(xs.renderedNotRecognized).toEqual([]);
  });

  it('2. reports an unknown ID in the explicit responsive layout by fingerprint', () => {
    const xs = audit({ explicitLayouts: { xs: layout('alpha', 'beta', 'orphan') } }).breakpoints.xs;
    expect(xs.structuralNotRecognized).toEqual([expect.objectContaining({
      fingerprint: fingerprintRuntimeShadowId('orphan'),
      category: 'unclassifiable',
    })]);
    expect(JSON.stringify(xs)).not.toContain('orphan');
  });

  it('3. reports a recognized root missing from the structural layout', () => {
    const xs = audit({ explicitLayouts: { xs: layout('alpha') } }).breakpoints.xs;
    expect(xs.missingIdsCount).toBe(1);
    expect(xs.recognizedNotStructural[0].fingerprint).toBe(fingerprintRuntimeShadowId('beta'));
  });

  it('4. keeps duplicate occurrence counts separate from unique IDs', () => {
    const xs = audit({ explicitLayouts: { xs: layout('alpha', 'alpha', 'beta') } }).breakpoints.xs;
    expect(xs.structuralIds).toMatchObject({ itemCount: 3, uniqueIdCount: 2 });
    expect(xs.structuralIds.duplicates).toEqual([
      expect.objectContaining({ fingerprint: fingerprintRuntimeShadowId('alpha'), occurrences: 2 }),
    ]);
  });

  it('5. classifies only explicitly known aliases as legacy', () => {
    const xs = audit({
      explicitLayouts: { xs: layout('alpha', 'beta', 'legacy-dashboard-card') },
      knownLegacyIds: ['legacy-dashboard-card'],
    }).breakpoints.xs;
    expect(xs.structuralNotRecognized[0]).toMatchObject({ category: 'legacy', evidence: 'known-legacy' });
  });

  it('6. classifies a special section independently from ordinary sections', () => {
    const xs = audit({
      rootElements: [section('starter-section-greeting-v1', 'greeting')],
      explicitLayouts: { xs: [] },
      rendererLayouts: { xs: layout('starter-section-greeting-v1') },
    }).breakpoints.xs;
    expect(xs.recognizedNotStructural[0].category).toBe('special-section');
  });

  it('7. classifies a root Stack as an atomic root element', () => {
    const xs = audit({
      rootElements: [stack('section-stack-grid-1')],
      explicitLayouts: { xs: [] },
      rendererLayouts: { xs: layout('section-stack-grid-1') },
    }).breakpoints.xs;
    expect(xs.recognizedNotStructural[0].category).toBe('stack');
  });

  it('8. distinguishes a known Stack child filtered from the root', () => {
    const xs = audit({
      rootElements: [widget('alpha')],
      knownNonRootElements: [widget('light.custom_7', 'light')],
      explicitLayouts: { xs: layout('alpha', 'light.custom_7') },
      rendererLayouts: { xs: layout('alpha') },
    }).breakpoints.xs;
    expect(xs.structuralNotRecognized[0]).toMatchObject({ category: 'widget', evidence: 'known-non-root' });
  });

  it('9. reports differences between GridCanvas roots and renderer inputs', () => {
    const xs = audit({ rendererLayouts: { xs: layout('alpha', 'renderer-only') } }).breakpoints.xs;
    expect(xs.recognizedNotRendered.map((entry) => entry.fingerprint)).toEqual([fingerprintRuntimeShadowId('beta')]);
    expect(xs.renderedNotRecognized.map((entry) => entry.fingerprint)).toEqual([
      fingerprintRuntimeShadowId('renderer-only'),
    ]);
  });

  it('10. keeps breakpoint differences and normalization-only mismatches visible', () => {
    const report = audit({
      rootElements: [widget('Alpha')],
      explicitLayouts: { lg: layout(' alpha '), xs: layout('Alpha') },
      rendererLayouts: { lg: layout('Alpha'), xs: layout('Alpha') },
    });
    expect(report.breakpoints.lg.normalizationDifferences).toHaveLength(1);
    expect(report.breakpoints.xs.normalizationDifferences).toHaveLength(0);
    expect(report.affectedBreakpoints).toContain('lg');
  });

  it('11. represents a complete XS layout and an LG layout with one extra ID', () => {
    const report = audit({
      explicitLayouts: {
        xl: layout('alpha', 'beta', 'removed'),
        lg: layout('alpha', 'beta', 'removed'),
        xs: layout('alpha', 'beta'),
      },
      rendererLayouts: {
        xl: layout('alpha', 'beta'),
        lg: layout('alpha', 'beta'),
        xs: layout('alpha', 'beta'),
      },
    });
    expect(report.breakpoints.xs.unknownIdsCount).toBe(0);
    expect(report.breakpoints.lg.unknownIdsCount).toBe(1);
    expect(report.breakpoints.lg.structuralNotRecognized[0].fingerprint)
      .toBe(fingerprintRuntimeShadowId('removed'));
    expect(report.unknownIdsCount).toBe(1);
    expect(report.unknownIdOccurrences).toBe(2);
    expect(report.unknownIdGroups[0].breakpoints).toEqual(['xl', 'lg']);
  });

  it('12. reports a partial explicit layout without filling it', () => {
    const xs = audit({ explicitLayouts: { xs: layout('alpha') } }).breakpoints.xs;
    expect(xs.hasExplicitStructuralLayout).toBe(true);
    expect(xs.structuralIds.itemCount).toBe(1);
    expect(xs.recognizedRootIds.itemCount).toBe(2);
  });

  it('13. exposes a temporarily incomplete recognized-root set without relabeling data', () => {
    const first = audit({
      rootElements: [widget('alpha')],
      explicitLayouts: { xs: layout('alpha', 'beta') },
      rendererLayouts: { xs: layout('alpha') },
    });
    const settled = audit();
    expect(first.breakpoints.xs.unknownIdsCount).toBe(1);
    expect(settled.breakpoints.xs.unknownIdsCount).toBe(0);
  });

  it('14. never mutates any source data', () => {
    const input: RuntimeShadowIdAuditInput = {
      rootElements: [widget('alpha'), widget('beta')],
      explicitLayouts: { xs: layout('alpha', 'beta') },
      rendererLayouts: { xs: layout('alpha', 'beta') },
    };
    const before = structuredClone(input);
    auditRuntimeShadowIds(input);
    expect(input).toEqual(before);
  });

  it('15. excludes raw IDs and unrelated HA data from standard diagnostics', () => {
    const input = {
      rootElements: [widget('sensor.private_room')],
      explicitLayouts: { xs: layout('sensor.private_room') },
      rendererLayouts: { xs: layout('sensor.private_room') },
      haState: { access_token: 'DO-NOT-LOG', attributes: { friendly_name: 'Private room' } },
    } as RuntimeShadowIdAuditInput;
    const serialized = JSON.stringify(auditRuntimeShadowIds(input));
    expect(serialized).not.toContain('sensor.private_room');
    expect(serialized).not.toContain('DO-NOT-LOG');
    expect(serialized).not.toContain('Private room');
  });

  it('16. does not promote an invalid baseline when the audit finds the extra ID', () => {
    const structural = layout('alpha', 'beta', 'deleted-card');
    const renderer = layout('alpha', 'beta');
    const input: RuntimeShadowInput = {
      breakpoint: 'lg',
      cols: 8,
      rootElements: [widget('alpha'), widget('beta')],
      hasExplicitLayout: true,
      explicitLayout: structural,
      derivedLayout: renderer,
      legacyRuntimeInput: renderer,
      explicitRootLayouts: { lg: structural },
      legacyRuntimeLayouts: { lg: renderer },
      lightStates: [],
    };
    const report = analyzeRuntimeShadow(input);
    expect(report.baseline.quality).toBe('unreliable');
    expect(report.issueCodes).toContain('UNKNOWN_LAYOUT_ID');
    expect(report.solverStatus).toBe('not-run');
    expect(report.baselineIdAudit.breakpoints.lg.unknownIdsCount).toBe(1);
  });

  it('17. preserves every saved layout item and coordinate', () => {
    const explicitLayouts: DashboardBreakpointLayouts = {
      lg: [{ i: 'deleted-card', x: 7, y: 9, w: 1, h: 3 }],
      xs: [{ i: 'alpha', x: 0, y: 4, w: 2, h: 2 }],
    };
    const before = structuredClone(explicitLayouts);
    audit({ explicitLayouts });
    expect(explicitLayouts).toEqual(before);
  });
});
