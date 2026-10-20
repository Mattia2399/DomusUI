import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGridEngine2RuntimeGeometryInspectEnabled } from './runtimeShadowFeatureFlag';
import { inspectRuntimeGeometry, type RuntimeGeometryStructuralContext } from './runtimeGeometryDiagnostics';
import {
  finalizeRuntimeGeometryDomInspection,
  readRuntimeGeometryDomSnapshot,
  scheduleRuntimeGeometryDomInspection,
  type RuntimeGeometryDomMeasurementContext,
  type RuntimeGeometryDomSnapshot,
} from './runtimeGeometryDomInspection';

const structuralContext: RuntimeGeometryStructuralContext = {
  generation: 7,
  revision: 109,
  fingerprint: 'dsl-v1-dom-inspection',
};
const geometry = {
  width: 600,
  cols: 6,
  rowHeight: 20,
  gap: [0, 0] as const,
  padding: [0, 0] as const,
};

type ControlledAnimation = Animation & { finishForTest: () => void };

class ControlledRuntime {
  nowValue = 0;
  nextHandle = 1;
  frames = new Map<number, FrameRequestCallback>();
  timers = new Map<number, { due: number; callback: () => void }>();

  readonly runtime = {
    now: () => this.nowValue,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const handle = this.nextHandle++;
      this.frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle: number) => {
      this.frames.delete(handle);
    },
    setTimeout: (callback: () => void, delayMs: number) => {
      const handle = this.nextHandle++;
      this.timers.set(handle, { due: this.nowValue + delayMs, callback });
      return handle;
    },
    clearTimeout: (handle: number) => {
      this.timers.delete(handle);
    },
  };

  frame() {
    this.nowValue += 16;
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.nowValue));
  }

  advance(milliseconds: number) {
    const target = this.nowValue + milliseconds;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort(([, first], [, second]) => first.due - second.due)[0];
      if (!next) break;
      const [handle, timer] = next;
      this.timers.delete(handle);
      this.nowValue = timer.due;
      timer.callback();
    }
    this.nowValue = target;
  }
}

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function reportFor(ids: readonly string[]) {
  const layout = ids.map((id, index) => ({ i: id, x: 0, y: index, w: 1, h: 1 }));
  return inspectRuntimeGeometry({
    breakpoint: 'lg',
    cols: 6,
    rootElements: ids.map((id) => ({ id, role: 'widget' as const, kind: id.includes('light') ? 'light' : 'sensor' })),
    structuralLayout: layout,
    solverCandidate: layout,
    legacyRuntimeInput: layout,
    appliedOverrideIds: [],
    baselineQuality: 'explicit-complete-candidate',
    comparisonConfidence: 'reliable',
    structuralContext,
    expectedStructuralContext: structuralContext,
  });
}

function controlledAnimation(
  root: HTMLElement,
  properties: readonly string[],
  transitionProperty?: string,
): ControlledAnimation {
  let state: AnimationPlayState = 'running';
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const keyframe = Object.fromEntries(properties.map((property) => [property, property === 'opacity' ? '0.5' : 'none']));
  return {
    effect: {
      target: root,
      getKeyframes: () => [keyframe],
    } as unknown as KeyframeEffect,
    get playState() { return state; },
    pending: false,
    finished,
    transitionProperty,
    finishForTest: () => {
      state = 'finished';
      resolveFinished();
    },
  } as unknown as ControlledAnimation;
}

function fixture(ids: readonly string[], renderer: 'legacy' | 'grid-engine-2' = 'legacy') {
  const host = document.createElement('div');
  const canvas = document.createElement('div');
  canvas.className = 'sections-grid react-grid-layout';
  if (renderer === 'grid-engine-2') canvas.dataset.gridEngineRootRenderer = 'grid-engine-2';
  canvas.getBoundingClientRect = () => domRect(10, 20, 600, 800);
  host.append(canvas);
  document.body.append(host);
  const roots = new Map<string, HTMLElement>();
  const rects = new Map<string, { left: number; top: number; width: number; height: number }>();
  const animations = new Map<string, Animation[]>();
  const animationCalls = new Map<string, unknown[]>();
  ids.forEach((id, index) => {
    const root = document.createElement('div');
    root.className = 'react-grid-item';
    if (renderer === 'grid-engine-2') root.dataset.gridEngineRootItem = id;
    const marker = document.createElement('span');
    marker.dataset.gridEngineRuntimeGeometryId = id;
    root.append(marker);
    canvas.append(root);
    rects.set(id, { left: 10, top: 20 + index * 20, width: 100, height: 20 });
    animations.set(id, []);
    animationCalls.set(id, []);
    root.getBoundingClientRect = () => {
      const current = rects.get(id)!;
      return domRect(current.left, current.top, current.width, current.height);
    };
    Object.defineProperty(root, 'getAnimations', {
      configurable: true,
      value: (options?: GetAnimationsOptions) => {
        animationCalls.get(id)!.push(options);
        return animations.get(id)!;
      },
    });
    roots.set(id, root);
  });
  return { host, canvas, roots, rects, animations, animationCalls };
}

function measurementContext(ids: readonly string[], overrides: Partial<RuntimeGeometryDomMeasurementContext> = {}) {
  return {
    breakpoint: 'lg',
    renderer: 'legacy',
    diagnosticSignature: 'geometry-signature-1',
    geometrySignature: '600:6:20',
    structuralContext,
    rootIds: [...ids],
    ...overrides,
  } satisfies RuntimeGeometryDomMeasurementContext;
}

function schedule(
  ids: readonly string[],
  dom: ReturnType<typeof fixture>,
  runtime: ControlledRuntime,
  options: {
    context?: RuntimeGeometryDomMeasurementContext;
    getContext?: () => RuntimeGeometryDomMeasurementContext;
    deadlineMs?: number;
  } = {},
) {
  const context = options.context ?? measurementContext(ids);
  const logger = { info: vi.fn() };
  const handle = scheduleRuntimeGeometryDomInspection({
    host: dom.host,
    comparison: reportFor(ids),
    geometry,
    signature: context.diagnosticSignature,
    measurementContext: context,
    getCurrentMeasurementContext: options.getContext ?? (() => context),
    deadlineMs: options.deadlineMs ?? 1_200,
    runtime: runtime.runtime,
    logger,
  });
  return { handle, logger };
}

function payload(logger: { info: ReturnType<typeof vi.fn> }) {
  return logger.info.mock.calls.at(-1)?.[1] as Record<string, any> | undefined;
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('runtime geometry DOM stabilization', () => {
  it('1. measures stable geometry in exactly two frames when no animation is active', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.dom.status).toBe('stable');
    expect(payload(logger)?.counts.domSnapshots).toBe(2);
    expect(handle.getMetrics()).toMatchObject({ snapshotCount: 2, reported: true, cancellationCount: 0 });
  });

  it('2. waits for a geometric transition longer than the old 160 ms delay', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const animation = controlledAnimation(dom.roots.get('light')!, ['transform'], 'transform');
    dom.animations.set('light', [animation]);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    runtime.advance(300);
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics().snapshotCount).toBe(0);
    animation.finishForTest();
    await settlePromises();
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.dom.status).toBe('stable');
    expect(payload(logger)?.timings.domStabilizationWaitMs).toBe(300);
  });

  it('3. acquires both rectangles only after the transition completes', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const rectSpy = vi.spyOn(dom.roots.get('light')!, 'getBoundingClientRect');
    const animation = controlledAnimation(dom.roots.get('light')!, ['height']);
    dom.animations.set('light', [animation]);
    const runtime = new ControlledRuntime();
    schedule(ids, dom, runtime);
    expect(rectSpy).not.toHaveBeenCalled();
    animation.finishForTest();
    await settlePromises();
    runtime.frame();
    runtime.frame();
    expect(rectSpy).toHaveBeenCalledTimes(2);
  });

  it('4. accepts an inter-frame delta within 1 px and records the maximum', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    dom.rects.get('light')!.left += 0.8;
    runtime.frame();
    expect(payload(logger)?.elements[0].dom).toMatchObject({
      status: 'stable', reason: 'two-consecutive-dom-observations-agree', maxInterFrameDeltaPx: 0.8,
    });
  });

  it('5. marks an inter-frame delta above 1 px as transient', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    dom.rects.get('light')!.top += 1.01;
    runtime.frame();
    expect(payload(logger)?.elements[0].dom).toMatchObject({
      status: 'measurement-transient', reason: 'inter-frame-rect-delta', maxInterFrameDeltaPx: 1.01,
    });
  });

  it('6. preserves fractional coordinates without confusing expected deltas with stability', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    dom.rects.set('light', { left: 10.25, top: 20.5, width: 99.75, height: 20.25 });
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.elements[0].dom).toMatchObject({
      status: 'stable', observed: { left: 0.25, top: 0.5, width: 99.75, height: 20.25 },
    });
  });

  it('7. ignores decorative root and descendant animations', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    dom.animations.set('light', [controlledAnimation(dom.roots.get('light')!, ['opacity'])]);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.dom.status).toBe('stable');
    expect(handle.getMetrics().relevantGeometryAnimationCount).toBe(0);
    expect(dom.animationCalls.get('light')).toEqual(expect.arrayContaining([{ subtree: false }]));
  });

  it('8. bounds a continuous geometric animation with the deadline', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    dom.animations.set('light', [controlledAnimation(dom.roots.get('light')!, ['transform'])]);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime, { deadlineMs: 500 });
    runtime.advance(500);
    expect(payload(logger)?.elements[0].dom.reason).toBe('measurement-deadline-exceeded');
    expect(payload(logger)?.dom.status).toBe('measurement-transient');
    expect(handle.getMetrics()).toMatchObject({ deadlineReached: true, snapshotCount: 2, reported: true });
  });

  it('9. applies the deadline even if animation frames are throttled', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime, { deadlineMs: 400 });
    runtime.advance(400);
    expect(payload(logger)?.elements[0].dom.reason).toBe('measurement-deadline-exceeded');
  });

  it('10. invalidates a pending acquisition when the breakpoint changes', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const animation = controlledAnimation(dom.roots.get('light')!, ['height']);
    dom.animations.set('light', [animation]);
    const runtime = new ControlledRuntime();
    let current = measurementContext(ids);
    const { handle, logger } = schedule(ids, dom, runtime, { getContext: () => current });
    current = { ...current, breakpoint: 'md' };
    animation.finishForTest();
    await settlePromises();
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics()).toMatchObject({ contextInvalidated: true, cancellationCount: 1 });
  });

  it('11. invalidates a pending acquisition when the renderer changes', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    dom.canvas.dataset.gridEngineRootRenderer = 'grid-engine-2';
    runtime.frame();
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics().contextInvalidated).toBe(true);
  });

  it('11a. waits for the expected lazy renderer instead of reporting its fallback', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const context = measurementContext(ids, { renderer: 'grid-engine-2' });
    const { handle, logger } = schedule(ids, dom, runtime, { context });

    runtime.frame();
    expect(handle.getMetrics().snapshotCount).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();

    dom.roots.get('light')!.dataset.gridEngineRootItem = 'light';
    dom.canvas.dataset.gridEngineRootRenderer = 'grid-engine-2';
    await settlePromises();
    runtime.frame();
    runtime.frame();

    expect(payload(logger)?.dom).toMatchObject({ renderer: 'grid-engine-2', status: 'stable' });
    expect(handle.getMetrics()).toMatchObject({ snapshotCount: 2, reported: true, cancellationCount: 0 });
  });

  it('11b. invalidates a changed context while the expected lazy renderer is still absent', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const context = measurementContext(ids, { renderer: 'grid-engine-2' });
    let current = context;
    const { handle, logger } = schedule(ids, dom, runtime, {
      context,
      getContext: () => current,
      deadlineMs: 500,
    });

    current = { ...current, breakpoint: 'md' };
    runtime.advance(500);

    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics()).toMatchObject({
      contextInvalidated: true,
      cancellationCount: 1,
      deadlineReached: false,
      snapshotCount: 0,
    });
  });

  it('12. invalidates a pending acquisition when the HA generation changes', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    let current = measurementContext(ids);
    const { handle, logger } = schedule(ids, dom, runtime, { getContext: () => current });
    current = { ...current, structuralContext: { ...structuralContext, generation: 8, revision: 110 } };
    runtime.frame();
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics().contextInvalidated).toBe(true);
  });

  it('13. invalidates a pending acquisition when its diagnostic or geometry signature changes', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    let current = measurementContext(ids);
    const { handle, logger } = schedule(ids, dom, runtime, { getContext: () => current });
    current = { ...current, diagnosticSignature: 'geometry-signature-2', geometrySignature: '601:6:20' };
    runtime.frame();
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics().contextInvalidated).toBe(true);
  });

  it('14. performs no stale callback after unmount', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    dom.host.remove();
    runtime.frame();
    runtime.advance(1_200);
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics()).toMatchObject({ contextInvalidated: true, snapshotCount: 0 });
  });

  it('15. cancels a superseded acquisition before any DOM read', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    handle.cancel();
    runtime.frame();
    runtime.advance(1_200);
    expect(logger.info).not.toHaveBeenCalled();
    expect(handle.getMetrics()).toMatchObject({ cancellationCount: 1, snapshotCount: 0, reported: false });
  });

  it('16. remains deterministic with prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.dom.acquisition).toMatchObject({ reducedMotion: true, snapshotCount: 2 });
    expect(payload(logger)?.dom.status).toBe('stable');
  });

  it('17. keeps only the latest of two rapid Light updates', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const firstAnimation = controlledAnimation(dom.roots.get('light')!, ['height']);
    dom.animations.set('light', [firstAnimation]);
    const runtime = new ControlledRuntime();
    const first = schedule(ids, dom, runtime);
    first.handle.cancel();
    const nextContext = measurementContext(ids, { diagnosticSignature: 'geometry-signature-2' });
    dom.animations.set('light', []);
    const second = schedule(ids, dom, runtime, { context: nextContext });
    firstAnimation.finishForTest();
    await settlePromises();
    runtime.frame();
    runtime.frame();
    expect(first.logger.info).not.toHaveBeenCalled();
    expect(second.logger.info).toHaveBeenCalledTimes(1);
    expect(first.handle.getMetrics().cancellationCount).toBe(1);
  });

  it('18. publishes no duplicate report for an unchanged scheduled input', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    runtime.frame();
    runtime.advance(2_000);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('19. logs only fingerprints and sanitized acquisition metadata', () => {
    const ids = ['private.light-secret'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    const serialized = JSON.stringify(payload(logger));
    expect(serialized).toContain('idFingerprint');
    expect(serialized).not.toContain('private.light-secret');
    expect(serialized).not.toMatch(/access_token|password|SECRET/);
  });

  it('20. remains disabled unless both development-only flags are exact true', () => {
    expect(isGridEngine2RuntimeGeometryInspectEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT: 'false',
    })).toBe(false);
    expect(isGridEngine2RuntimeGeometryInspectEnabled({
      DEV: false,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_GEOMETRY_INSPECT: 'true',
    })).toBe(false);
  });

  it('21. invalidates replaced canvas or root nodes and changed root sets', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const replaced = schedule(ids, dom, runtime);
    dom.canvas.replaceWith(dom.canvas.cloneNode(true));
    runtime.frame();
    expect(replaced.logger.info).not.toHaveBeenCalled();
    expect(replaced.handle.getMetrics().contextInvalidated).toBe(true);

    document.body.replaceChildren();
    const changedDom = fixture(ids);
    const changedRuntime = new ControlledRuntime();
    const changed = schedule(ids, changedDom, changedRuntime);
    changedDom.roots.get('light')!.remove();
    changedRuntime.frame();
    expect(changed.logger.info).not.toHaveBeenCalled();
    expect(changed.handle.getMetrics().contextInvalidated).toBe(true);
  });

  it('22. records a new geometry animation that starts after the one-shot wait', async () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const firstAnimation = controlledAnimation(dom.roots.get('light')!, ['height']);
    dom.animations.set('light', [firstAnimation]);
    const runtime = new ControlledRuntime();
    const { logger } = schedule(ids, dom, runtime);
    firstAnimation.finishForTest();
    await settlePromises();
    dom.animations.set('light', [controlledAnimation(dom.roots.get('light')!, ['transform'])]);
    runtime.frame();
    runtime.frame();
    expect(payload(logger)?.elements[0].dom.reason).toBe('geometry-animation-running');
  });

  it('23. exposes context invalidation distinctly in the pure finalizer', () => {
    const ids = ['light'];
    const dom = fixture(ids);
    const report = reportFor(ids);
    const first = readRuntimeGeometryDomSnapshot({
      host: dom.host, elementIds: ids, structuralContext,
    });
    const second: RuntimeGeometryDomSnapshot = {
      ...first,
      structuralContext: { ...structuralContext, generation: 8 },
    };
    const result = finalizeRuntimeGeometryDomInspection({ comparison: report, first, second, geometry });
    expect(result.status).toBe('unavailable');
    expect(result.elements[0].reason).toBe('measurement-context-invalidated');
  });

  it.each([11, 21, 30])('24. reads %i roots twice without polling', (count) => {
    const ids = Array.from({ length: count }, (_, index) => `root-${index}`);
    const dom = fixture(ids);
    const runtime = new ControlledRuntime();
    const { handle, logger } = schedule(ids, dom, runtime);
    runtime.frame();
    runtime.frame();
    const result = payload(logger)!;
    expect(result.counts.roots).toBe(count);
    expect(result.counts.domSnapshots).toBe(2);
    expect(handle.getMetrics()).toMatchObject({ snapshotCount: 2, stabilizationWaitMs: 0 });
    console.info(`[runtime-geometry DOM perf ${count}]`, result.timings);
  });
});
