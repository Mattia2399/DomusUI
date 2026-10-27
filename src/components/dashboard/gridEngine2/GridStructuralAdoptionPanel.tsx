import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, ChevronDown, Eye, ShieldAlert, Trash2 } from 'lucide-react';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import {
  acknowledgeGridStructuralAdoptionCandidateV1,
  createGridStructuralAdoptionCandidateV1,
  invalidateGridStructuralAdoptionCandidateV1,
  type GridStructuralAdoptionBreakpointInput,
  type GridStructuralAdoptionCandidateV1,
  type GridStructuralAdoptionInventoryEntry,
  type GridStructuralAdoptionSourceIdentity,
} from './gridStructuralAdoptionCandidate';
import type { GridLayoutMode } from './model';

export type GridStructuralAdoptionPanelProps = Readonly<{
  sourceIdentity: GridStructuralAdoptionSourceIdentity;
  currentSourceIdentity: GridStructuralAdoptionSourceIdentity;
  inventory: readonly GridStructuralAdoptionInventoryEntry[];
  legacyExtraIds: readonly string[];
  breakpoints: readonly GridStructuralAdoptionBreakpointInput[];
  initialBreakpoint: DashboardGridBreakpoint;
}>;

function formatGeometry(item: { x: number; y: number; w: number; h: number } | null) {
  return item ? `x${item.x} y${item.y} w${item.w} h${item.h}` : 'Missing';
}

function sourceIdentityKey(identity: GridStructuralAdoptionSourceIdentity) {
  return [
    identity.editSessionId,
    identity.draftFingerprint,
    identity.inventoryFingerprint,
    identity.structuralGeneration,
    identity.structuralRevision,
    identity.structuralFingerprint,
  ].join('|');
}

function lifecycleLabel(candidate: GridStructuralAdoptionCandidateV1) {
  if (candidate.lifecycle === 'acknowledged') return 'Candidato esaminato in memoria';
  if (candidate.lifecycle === 'invalidated') return 'Candidato invalidato';
  return 'Candidato preparato in memoria';
}

export function GridStructuralAdoptionPanel({
  sourceIdentity,
  currentSourceIdentity,
  inventory,
  legacyExtraIds,
  breakpoints,
  initialBreakpoint,
}: GridStructuralAdoptionPanelProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<GridLayoutMode>('manual');
  const [selectedBreakpoints, setSelectedBreakpoints] = useState<ReadonlySet<DashboardGridBreakpoint>>(
    () => new Set([initialBreakpoint]),
  );
  const [candidate, setCandidate] = useState<GridStructuralAdoptionCandidateV1 | null>(null);
  const currentIdentityKey = sourceIdentityKey(currentSourceIdentity);
  const sourceByBreakpoint = useMemo(() => new Map(
    breakpoints.map((entry) => [entry.breakpoint, entry]),
  ), [breakpoints]);
  const rootCount = inventory.filter((entry) => (
    entry.role === 'root-widget' || entry.role === 'stack-root' || entry.role === 'special-section'
  )).length;

  useEffect(() => {
    setCandidate((current) => current
      ? invalidateGridStructuralAdoptionCandidateV1(current, currentSourceIdentity)
      : null);
  }, [currentIdentityKey, currentSourceIdentity]);

  const toggleBreakpoint = (breakpoint: DashboardGridBreakpoint) => {
    setSelectedBreakpoints((current) => {
      const next = new Set(current);
      if (next.has(breakpoint)) next.delete(breakpoint);
      else next.add(breakpoint);
      return next;
    });
  };

  const prepareCandidate = () => {
    setCandidate(createGridStructuralAdoptionCandidateV1({
      sourceIdentity,
      currentSourceIdentity,
      inventory,
      legacyExtraIds,
      breakpoints,
      selectedBreakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.filter((breakpoint) => selectedBreakpoints.has(breakpoint)),
      mode,
      authority: {
        source: 'structural-policy-v1',
        renderingAuthority: 'not-authorized',
        reasonCodes: ['PREVIEW_AUTHORITY_NON_AUTHORITATIVE'],
      },
    }));
  };

  return (
    <section
      data-testid="grid-structural-adoption-panel"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-4 text-white/70"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-50/90">
          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
          Prepara adozione layout
        </span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div data-testid="grid-structural-adoption-content" className="mt-4 space-y-4">
          <div role="note" className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-cyan-50/70">
            Lo staging vive soltanto in questa finestra. Non modifica Home, draft operativo, undo/recovery,
            storage o Home Assistant. La conferma registra esclusivamente che il candidato e stato esaminato.
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <fieldset disabled={Boolean(candidate)} className="rounded-xl border border-white/[0.08] p-3 disabled:opacity-60">
              <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Breakpoint da esaminare
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
                  const source = sourceByBreakpoint.get(breakpoint);
                  return (
                    <label key={breakpoint} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedBreakpoints.has(breakpoint)}
                        onChange={() => toggleBreakpoint(breakpoint)}
                        aria-label={`Seleziona ${breakpoint.toUpperCase()}`}
                      />
                      <span>{breakpoint.toUpperCase()} · {source?.cols ?? '?'} col · {source?.baselineState ?? 'missing'}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset disabled={Boolean(candidate)} className="rounded-xl border border-white/[0.08] p-3 disabled:opacity-60">
              <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Modalita dichiarata
              </legend>
              <div className="mt-2 flex gap-3 text-xs">
                {(['manual', 'automatic'] as const).map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="grid-structural-adoption-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {value === 'manual' ? 'Manual' : 'Automatic'}
                  </label>
                ))}
              </div>
              <p className="mt-2 max-w-xs text-[10px] leading-4 text-white/40">
                Nessuna modalita esegue COMPACT durante la preparazione.
              </p>
            </fieldset>
          </div>

          {!candidate ? (
            <details open data-testid="grid-adoption-source-preview" className="rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-white/75">Geometria sorgente acquisita all apertura</summary>
              <div className="mt-3 space-y-3">
                {DASHBOARD_GRID_BREAKPOINT_ORDER.filter((breakpoint) => selectedBreakpoints.has(breakpoint)).map((breakpoint) => {
                  const source = sourceByBreakpoint.get(breakpoint);
                  return (
                    <div key={breakpoint}>
                      <p className="font-semibold text-cyan-50/70">
                        {breakpoint.toUpperCase()} · {source?.baselineState ?? 'missing'} · renderer {source?.operationalGeometry?.length ?? 0} elementi
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-white/48">
                        {(source?.operationalGeometry ?? []).map((item) => (
                          <span key={`${breakpoint}:${item.i}`}>{item.i}: {formatGeometry(item)}</span>
                        ))}
                        {!source?.operationalGeometry ? <span>Geometria operativa non acquisita.</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {!candidate ? (
              <button
                type="button"
                data-testid="prepare-grid-structural-adoption"
                disabled={selectedBreakpoints.size === 0}
                onClick={prepareCandidate}
                className="rounded-full border border-amber-200/25 bg-amber-200/10 px-4 py-2 text-xs font-semibold text-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prepara candidato in memoria
              </button>
            ) : (
              <>
                {candidate.lifecycle === 'prepared' ? (
                  <button
                    type="button"
                    data-testid="acknowledge-grid-structural-adoption"
                    onClick={() => setCandidate((current) => current
                      ? acknowledgeGridStructuralAdoptionCandidateV1(current, currentSourceIdentity)
                      : null)}
                    className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-xs font-semibold text-cyan-50"
                  >
                    Conferma di aver esaminato il candidato
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="discard-grid-structural-adoption"
                  onClick={() => setCandidate(null)}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-rose-200/[0.07] px-4 py-2 text-xs font-semibold text-rose-50/85"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Scarta candidato
                </button>
              </>
            )}
            <span className="text-xs text-white/45">{rootCount} root inventariati</span>
          </div>

          {candidate ? (
            <div data-testid="grid-structural-adoption-candidate" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/40">Staging</p>
                  <p data-testid="grid-adoption-lifecycle" className="mt-1 text-sm font-semibold text-cyan-50/85">
                    {lifecycleLabel(candidate)}
                  </p>
                  <p className="mt-1 break-all text-[10px] text-white/35">{candidate.candidateSignature}</p>
                </div>
                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-3">
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/40">Verifica strutturale</p>
                  <p data-testid="grid-adoption-verification" className="mt-1 text-sm font-semibold text-amber-50/85">
                    {candidate.structuralVerification.status}
                  </p>
                  <p className="mt-1 text-[10px] text-white/40">Separata dall acknowledgement.</p>
                </div>
                <div className="rounded-xl border border-rose-300/20 bg-rose-300/[0.045] p-3">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em] text-white/40">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Autorizzazione
                  </p>
                  <p data-testid="grid-adoption-authorization" className="mt-1 text-sm font-semibold text-rose-50/85">
                    Applicazione non autorizzata
                  </p>
                  <p className="mt-1 text-[10px] text-white/40">Nessun pulsante Apply disponibile.</p>
                </div>
              </div>

              {candidate.issues.length > 0 ? (
                <details open={candidate.lifecycle === 'invalidated'} className="rounded-xl border border-amber-300/15 bg-black/10 p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-amber-50/80">
                    Warning, blocchi e requisiti irrisolti · {candidate.issues.length}
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {candidate.issues.map((entry, index) => (
                      <li key={`${entry.code}:${entry.breakpoint ?? ''}:${entry.rootId ?? ''}:${index}`} className="leading-5 text-white/55">
                        <code className="text-[10px] text-amber-100/65">{entry.code}</code> · {entry.message}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {candidate.breakpoints.map((breakpoint) => (
                <details
                  key={breakpoint.breakpoint}
                  data-testid={`grid-adoption-breakpoint-${breakpoint.breakpoint}`}
                  open={breakpoint.breakpoint === initialBreakpoint}
                  className="rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs"
                >
                  <summary className="cursor-pointer font-semibold text-white/80">
                    {breakpoint.breakpoint.toUpperCase()} · {breakpoint.cols} colonne · {breakpoint.eligibility}
                    {' · '}{breakpoint.structuralVerification}
                  </summary>
                  <p className="mt-2 leading-5 text-white/45">
                    Sorgente: {breakpoint.provenance.operational}; candidato: {breakpoint.provenance.candidate};
                    draft: {breakpoint.provenance.draft}; HA: {breakpoint.provenance.persisted}.
                    Fallback responsive: {breakpoint.provenance.responsiveFallback}. Mutazioni: {breakpoint.geometryMutationCount}; compact: no.
                  </p>
                  {breakpoint.preservedLegacyExtraIds.length > 0 ? (
                    <p className="mt-2 text-amber-100/70">
                      ID legacy extra conservati come evidenza: {breakpoint.preservedLegacyExtraIds.join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06]">
                    <table className="min-w-[860px] text-left">
                      <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.1em] text-white/40">
                        <tr>
                          <th className="px-2 py-2">Root</th>
                          <th className="px-2 py-2">Sorgente operativa</th>
                          <th className="px-2 py-2">Candidato</th>
                          <th className="px-2 py-2">Draft esplicito</th>
                          <th className="px-2 py-2">HA esplicito</th>
                          <th className="px-2 py-2">Differenze</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakpoint.rootComparisons.map((row) => (
                          <tr
                            key={row.rootId}
                            data-testid={`grid-adoption-row-${breakpoint.breakpoint}-${row.rootId}`}
                            data-operational={formatGeometry(row.operational)}
                            data-candidate={formatGeometry(row.candidate)}
                            data-draft={formatGeometry(row.draftExplicit)}
                            data-persisted={formatGeometry(row.persistedExplicit)}
                            className="border-t border-white/[0.055]"
                          >
                            <td className="px-2 py-2">
                              <strong className="block text-white/75">{row.title}</strong>
                              <code className="text-[10px] text-cyan-100/50">{row.rootId}</code>
                            </td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.operational)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.candidate)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.draftExplicit)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.persistedExplicit)}</td>
                            <td className="px-2 py-2">
                              Draft {row.draftComparison} · HA {row.persistedComparison}
                              {row.runtimeSpan === 'different-from-draft-unresolved' ? ' · span runtime irrisolto' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}

              <p className="flex items-start gap-2 rounded-xl border border-white/[0.07] p-3 text-xs leading-5 text-white/48">
                <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Adoption Candidate V1 descrive la geometria sorgente aperta nell editor. Il Draft Change Set V1 resta
                separato e continua a descrivere soltanto le modifiche AFTER effettuate nel laboratorio.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default GridStructuralAdoptionPanel;
