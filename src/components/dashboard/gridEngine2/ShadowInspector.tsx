import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DASHBOARD_GRID_BREAKPOINT_ORDER, type DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_2_SHADOW_ENABLED } from './shadowFeatureFlag';
import {
  SHADOW_INSPECTOR_FIXTURES,
  createShadowInspectorFixtureSnapshot,
  type ShadowInspectorFixtureId,
} from './shadowInspectorFixtures';
import { meaningfulDifferenceCategories, type ShadowInspectorSnapshot } from './shadowInspectorSnapshot';
import {
  createShadowInspectorClient,
  type ShadowInspectorClient,
} from './shadowInspectorTransport';
import { ShadowInspectorCanvas } from './ShadowInspectorCanvas';

type InspectorSource = 'real' | 'fixture';

type ShadowInspectorProps = {
  readonly enabled?: boolean;
  readonly clientFactory?: (enabled: boolean) => ShadowInspectorClient;
};

const DEFAULT_CLIENT_FACTORY = (enabled: boolean) => createShadowInspectorClient({ enabled });

function metric(value: number | null) {
  return value === null ? 'n/d' : `${value.toFixed(2)} ms`;
}

function geometry(value: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | undefined) {
  return value ? `x${value.x} y${value.y} · ${value.w}×${value.h}` : '—';
}

function legacyProvenance(snapshot: ShadowInspectorSnapshot, breakpoint: DashboardGridBreakpoint) {
  if (snapshot.source.kind === 'fixture') return 'Fixture dimostrativa';
  if (snapshot.observedBreakpoint === breakpoint) return 'Effettivamente osservato sul canvas attivo';
  const report = snapshot.report.breakpoints[breakpoint];
  if (report.hasExplicitLayout) return 'Layout responsive esplicito · non osservato nel canvas attivo';
  return 'Fallback derivato dal sistema legacy · non osservato nel canvas attivo';
}

function sourceLabel(snapshot: ShadowInspectorSnapshot) {
  return snapshot.source.kind === 'real-shadow' ? 'Real Shadow' : `Fixture · ${snapshot.source.label}`;
}

export function ShadowInspector({
  enabled = GRID_ENGINE_2_SHADOW_ENABLED,
  clientFactory = DEFAULT_CLIENT_FACTORY,
}: ShadowInspectorProps) {
  const [source, setSource] = useState<InspectorSource>('fixture');
  const [fixtureId, setFixtureId] = useState<ShadowInspectorFixtureId>('collision');
  const [breakpoint, setBreakpoint] = useState<DashboardGridBreakpoint>('xl');
  const [realSnapshot, setRealSnapshot] = useState<ShadowInspectorSnapshot | null>(null);
  const [connection, setConnection] = useState<'disabled' | 'requesting' | 'connected' | 'unavailable'>(
    enabled ? 'requesting' : 'disabled',
  );
  const [requestNonce, setRequestNonce] = useState(0);
  const [renderMs, setRenderMs] = useState<number | null>(null);

  const fixtureSnapshot = useMemo(
    () => (enabled ? createShadowInspectorFixtureSnapshot(fixtureId) : null),
    [enabled, fixtureId],
  );

  useEffect(() => {
    if (!enabled) {
      setConnection('disabled');
      return undefined;
    }
    const client = clientFactory(true);
    if (!client.active) {
      setConnection('unavailable');
      return () => client.dispose();
    }
    let received = false;
    setConnection(realSnapshot ? 'connected' : 'requesting');
    const unsubscribe = client.subscribe((snapshot) => {
      received = true;
      setRealSnapshot(snapshot);
      setConnection('connected');
    });
    client.requestLatest();
    const timeoutId = window.setTimeout(() => {
      if (!received && !client.latest()) setConnection('unavailable');
    }, 1200);
    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
      client.dispose();
    };
    // A manual request deliberately recreates a short-lived client; there is
    // no polling and cleanup always closes its BroadcastChannel.
  }, [clientFactory, enabled, requestNonce]);

  const activeSnapshot = source === 'real' ? realSnapshot : fixtureSnapshot;
  const activeBreakpoint = activeSnapshot?.report.breakpoints[breakpoint] ?? null;

  useEffect(() => {
    if (!activeSnapshot || !activeBreakpoint) {
      setRenderMs(null);
      return undefined;
    }
    const startedAt = performance.now();
    const frameId = window.requestAnimationFrame(() => {
      setRenderMs(Math.max(0, performance.now() - startedAt));
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeBreakpoint, activeSnapshot]);

  if (!enabled) {
    return (
      <section
        aria-label="Shadow Inspector read-only"
        data-testid="shadow-inspector"
        data-source-kind="none"
        data-snapshot-lifecycle="none"
        className="rounded-[2rem] border border-white/[0.08] bg-white/[0.025] p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Grid Engine 2.0</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Grid Engine 2.0 — Shadow Inspector</h2>
        <p className="mt-3 text-sm text-white/58" data-testid="inspector-disabled">
          Inspector disabilitato. È disponibile soltanto in sviluppo con Shadow Mode esplicitamente attiva.
        </p>
      </section>
    );
  }

  const meaningfulDifferences = activeBreakpoint?.differences.filter(
    (difference) => meaningfulDifferenceCategories(difference.categories).length > 0,
  ) ?? [];

  return (
    <section
      aria-label="Shadow Inspector read-only"
      data-testid="shadow-inspector"
      data-source-kind={activeSnapshot?.source.kind ?? 'none'}
      data-snapshot-lifecycle={activeSnapshot?.lifecycle ?? 'none'}
      data-snapshot-id={activeSnapshot?.snapshotId ?? 'none'}
      data-observed-breakpoint={activeSnapshot?.observedBreakpoint ?? 'none'}
      className="min-w-0 overflow-hidden rounded-[2rem] border border-cyan-200/[0.12] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_35%),rgba(7,10,17,0.82)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-cyan-100/55">Grid Engine 2.0</p>
          <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Grid Engine 2.0 — Shadow Inspector</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Confronto geometrico read-only. Gli snapshot reali non sono persistiti e non sono applicabili alla Home.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-xs">
          <p className="text-white/38">Connessione snapshot</p>
          <p className="mt-1 font-semibold capitalize text-white/78" data-testid="inspector-connection">{connection}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={source === 'real'}
          onClick={() => setSource('real')}
          className={`rounded-full border px-3 py-2 text-xs font-semibold ${source === 'real' ? 'border-cyan-200/50 bg-cyan-300/15 text-cyan-50' : 'border-white/10 text-white/55'}`}
        >
          Real Shadow
        </button>
        <button
          type="button"
          aria-pressed={source === 'fixture'}
          onClick={() => setSource('fixture')}
          className={`rounded-full border px-3 py-2 text-xs font-semibold ${source === 'fixture' ? 'border-cyan-200/50 bg-cyan-300/15 text-cyan-50' : 'border-white/10 text-white/55'}`}
        >
          Fixture
        </button>
        <button
          type="button"
          onClick={() => {
            setConnection('requesting');
            setRequestNonce((current) => current + 1);
          }}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/[0.06]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Richiedi snapshot reale
        </button>
      </div>

      {source === 'fixture' ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Fixture Shadow Inspector">
          {SHADOW_INSPECTOR_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              type="button"
              aria-pressed={fixture.id === fixtureId}
              title={fixture.description}
              onClick={() => setFixtureId(fixture.id)}
              className={`rounded-xl px-3 py-2 text-xs ${fixture.id === fixtureId ? 'bg-white/12 text-white' : 'bg-white/[0.035] text-white/48'}`}
            >
              {fixture.label}
            </button>
          ))}
        </div>
      ) : null}

      {source === 'real' && !realSnapshot ? (
        <div className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-300/[0.05] p-4 text-sm text-amber-50/70" data-testid="inspector-real-empty">
          Nessuno snapshot reale disponibile. Apri la Home in un’altra scheda con Shadow Mode attiva, poi richiedi nuovamente lo snapshot. Le fixture restano disponibili.
        </div>
      ) : null}

      {activeSnapshot && activeBreakpoint ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/[0.035] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Origine</p>
              <p className="mt-1 text-sm font-semibold text-white/78" data-testid="inspector-source">{sourceLabel(activeSnapshot)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.035] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Acquisizione</p>
              <p className="mt-1 text-sm font-semibold text-white/78">{activeSnapshot.lifecycle === 'initial' ? 'Iniziale' : 'Aggiornata'} · ultima disponibile</p>
              <p className="mt-1 text-[10px] text-white/38">{new Date(activeSnapshot.capturedAt).toLocaleString('it-IT')} · completamento HA non confermabile</p>
            </div>
            <div className="rounded-2xl bg-white/[0.035] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Elementi</p>
              <p className="mt-1 font-mono text-sm text-white/78">
                root {activeSnapshot.report.summary.rootElementCount} · Stack {activeSnapshot.report.summary.stackContainerCount} · child {activeSnapshot.report.summary.stackChildCount}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.035] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Anomalie</p>
              <p className="mt-1 font-mono text-sm text-white/78">{activeSnapshot.report.summary.issueCount}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Breakpoint Shadow Inspector">
            {DASHBOARD_GRID_BREAKPOINT_ORDER.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-label={`Inspector breakpoint ${entry}`}
                aria-pressed={entry === breakpoint}
                onClick={() => setBreakpoint(entry)}
                className={`rounded-xl border px-3 py-2 font-mono text-xs uppercase ${entry === breakpoint ? 'border-violet-200/50 bg-violet-300/15 text-violet-50' : 'border-white/[0.07] text-white/45'}`}
              >
                {entry} · {activeSnapshot.report.breakpoints[entry].cols}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
            <span data-testid="inspector-breakpoint">Breakpoint <strong className="text-white/82">{breakpoint}</strong></span>
            <span data-testid="inspector-cols">Colonne <strong className="text-white/82">{activeBreakpoint.cols}</strong></span>
            <span>Osservato <strong className="text-white/82">{activeSnapshot.observedBreakpoint ?? 'nessuno · fixture'}</strong></span>
            <span data-testid="inspector-difference-count">Differenze <strong className="text-white/82">{meaningfulDifferences.length}</strong></span>
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/36">Sinistra</p>
                  <h3 className="text-sm font-semibold text-white/82">Legacy osservato</h3>
                </div>
                <span className="max-w-[65%] text-right text-[10px] text-white/42">{legacyProvenance(activeSnapshot, breakpoint)}</span>
              </div>
              <ShadowInspectorCanvas side="legacy" cols={activeBreakpoint.cols} differences={activeBreakpoint.differences} />
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/36">Destra</p>
                  <h3 className="text-sm font-semibold text-white/82">Grid Engine 2.0</h3>
                </div>
                <span className="text-right text-[10px] text-white/42">Layout derivato dal solver · NORMALIZE</span>
              </div>
              <ShadowInspectorCanvas side="solver" cols={activeBreakpoint.cols} differences={activeBreakpoint.differences} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
              <h3 className="text-sm font-semibold text-white/82">Differenze geometriche</h3>
              {meaningfulDifferences.length > 0 ? (
                <div className="mt-3 space-y-2" data-testid="inspector-difference-list">
                  {meaningfulDifferences.map((difference) => (
                    <div key={difference.diagnosticId} className="rounded-xl bg-white/[0.035] p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white/78">{difference.originalId}</span>
                        <span className="font-mono text-white/42">{geometry(difference.displayed)} → {geometry(difference.normalized)}</span>
                      </div>
                      <p className="mt-2 font-mono text-[10px] text-violet-100/65">{meaningfulDifferenceCategories(difference.categories).join(' · ')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-emerald-100/60" data-testid="inspector-no-differences">Nessuna differenza geometrica per questo breakpoint.</p>
              )}
              {activeBreakpoint.issues.length > 0 ? (
                <div className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] text-amber-100/65">
                  {activeBreakpoint.issues.map((issue, index) => (
                    <p key={`${issue.code}:${issue.diagnosticId ?? issue.originalId ?? index}`}>{issue.code} · {issue.scope} · {issue.originalId ?? 'elemento non identificato'}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4 text-xs">
                <h3 className="font-semibold text-white/82">Misurazioni</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-white/45">
                  <dt>Analisi</dt><dd className="text-right font-mono text-white/72" data-testid="inspector-analysis-ms">{metric(activeSnapshot.timings.analysisMs)}</dd>
                  <dt>Conversione</dt><dd className="text-right font-mono text-white/72" data-testid="inspector-conversion-ms">{metric(activeSnapshot.timings.conversionMs)}</dd>
                  <dt>Confronto</dt><dd className="text-right font-mono text-white/72" data-testid="inspector-comparison-ms">{metric(activeSnapshot.timings.comparisonMs)}</dd>
                  <dt>Render campione</dt><dd className="text-right font-mono text-white/72" data-testid="inspector-render-ms">{metric(renderMs)}</dd>
                </dl>
                <p className="mt-3 text-[10px] leading-4 text-white/32">Misure locali indicative, non garanzie prestazionali.</p>
              </div>

              {activeSnapshot.report.stacks.length > 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4 text-xs" data-testid="inspector-stack-list">
                  <h3 className="font-semibold text-white/82">Stack sintetici</h3>
                  <div className="mt-3 space-y-2">
                    {activeSnapshot.report.stacks.map((stack) => (
                      <p key={stack.diagnosticId} className="text-white/52">
                        {stack.originalId} · {stack.kind} · {stack.childCount} child · <span className="text-amber-100/65">INSUFFICIENT_DATA</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <h3 className="text-xs font-semibold text-white/65">Limitazioni dichiarate</h3>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-white/38">
              {activeSnapshot.report.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}
              <li>• Uno snapshot iniziale non implica che il caricamento Home Assistant sia concluso.</li>
            </ul>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default ShadowInspector;
