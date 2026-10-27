import { useMemo } from 'react';
import { AlertTriangle, Database, Layers3, ShieldCheck, X } from 'lucide-react';
import type { DashboardStateShape } from '../../../hooks/useDashboardState';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import type { GridItem, Widget } from '../../../types/dashboardModels';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import GlassModal from '../../ui/GlassModal';
import { GridEngineLab } from './GridEngineLab';
import { GridEditorRealCard, type GridEditorHouseMember } from './GridEditorRealCard';
import {
  GridStructuralAdoptionPanel,
  type GridStructuralAdoptionPanelProps,
} from './GridStructuralAdoptionPanel';
import type { GridStructuralPolicyConfigurationParseResult } from './gridStructuralPolicyConfiguration';
import type {
  GridEngineDraftReviewContext,
  GridEngineDraftSourceIdentity,
} from './gridEngineDraftChangeSet';
import {
  createGridEditorPreviewModel,
  type GridEditorEffectiveGeometrySnapshot,
  type GridEditorPreviewSource,
} from './gridEditorPreviewSnapshot';

export type GridEditorPreviewSession = Readonly<{
  dashboard: Readonly<DashboardLayoutConfiguration>;
  source: GridEditorPreviewSource;
  sourceIdentity: GridEngineDraftSourceIdentity;
  hasUnsavedEdits: boolean;
  initialBreakpoint: DashboardGridBreakpoint;
  editorGeometry: GridEditorEffectiveGeometrySnapshot | null;
  persistedDashboard: Readonly<DashboardLayoutConfiguration> | null;
  visualWidgets: readonly Widget[];
  dashboardState: DashboardStateShape;
  haStates: MockEntityStateMap;
  sensorHistoryByEntity: Readonly<Record<string, number[]>>;
  houseMembers: readonly GridEditorHouseMember[];
}>;

export type GridEditorPreviewDialogProps = Readonly<{
  session: GridEditorPreviewSession;
  currentSourceIdentity: GridEngineDraftSourceIdentity;
  onClose: () => void;
}>;

const GRID_EDITOR_RENDERING_AUTHORITY: GridStructuralPolicyConfigurationParseResult['renderingAuthority'] =
  'not-authorized';

function baselineLabel(kind: ReturnType<typeof createGridEditorPreviewModel>['baseline']['kind']) {
  if (kind === 'verified-source-copy') return 'Copia della sorgente HA verificata';
  if (kind === 'editor-draft') return 'Bozza editor isolata';
  if (kind === 'local-copy') return 'Copia locale non autorevole';
  return 'Baseline reconciled-provisional';
}

function formatGeometry(item: GridItem | null) {
  return item ? `x${item.x} y${item.y} w${item.w} h${item.h}` : 'n/d';
}

export function GridEditorPreviewDialog({
  session,
  currentSourceIdentity,
  onClose,
}: GridEditorPreviewDialogProps) {
  const model = useMemo(() => createGridEditorPreviewModel({
    dashboard: session.dashboard,
    persistedDashboard: session.persistedDashboard,
    editorGeometry: session.editorGeometry,
    source: session.source,
    hasUnsavedEdits: session.hasUnsavedEdits,
  }), [session]);
  const initialStatus = model.breakpointStatus[session.initialBreakpoint];
  const draftReview = useMemo<GridEngineDraftReviewContext>(() => ({
    sourceIdentity: session.sourceIdentity,
    currentSourceIdentity,
    inventory: model.inventoryEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      role: entry.role,
    })),
    breakpoints: Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
      const status = model.breakpointStatus[breakpoint];
      return [breakpoint, {
        origin: model.geometryAudit.breakpoints[breakpoint].source,
        baselineState: status.state === 'incomplete' ? 'provisional' : status.state,
      }];
    })) as GridEngineDraftReviewContext['breakpoints'],
    authority: {
      source: 'structural-policy-v1',
      renderingAuthority: GRID_EDITOR_RENDERING_AUTHORITY,
      reasonCodes: [
        'PREVIEW_AUTHORITY_NON_AUTHORITATIVE',
        'DRAFT_SAVE_QUARANTINE_NOT_AVAILABLE',
      ],
    },
  }), [currentSourceIdentity, model, session.sourceIdentity]);
  const adoptionReview = useMemo<Omit<GridStructuralAdoptionPanelProps, 'initialBreakpoint'>>(() => ({
    sourceIdentity: session.sourceIdentity,
    currentSourceIdentity,
    inventory: model.inventoryEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      role: entry.role,
      parentId: entry.parentId,
    })),
    legacyExtraIds: [...new Set([
      ...model.unknownLegacyIds,
      ...DASHBOARD_GRID_BREAKPOINT_ORDER.flatMap((breakpoint) => (
        model.geometryAudit.breakpoints[breakpoint].homeOnlyIds
      )),
    ])],
    breakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
      const audit = model.geometryAudit.breakpoints[breakpoint];
      const status = model.breakpointStatus[breakpoint];
      return {
        breakpoint,
        cols: audit.cols,
        baselineState: status.state === 'incomplete' ? 'provisional' as const : status.state,
        geometrySource: audit.source,
        operationalGeometry: session.editorGeometry?.layouts[breakpoint] ?? null,
        draftExplicitGeometry: session.dashboard.responsiveLayouts.root?.[breakpoint] ?? null,
        persistedExplicitGeometry: session.persistedDashboard?.responsiveLayouts.root?.[breakpoint] ?? null,
      };
    }),
  }), [currentSourceIdentity, model, session]);

  return (
    <GlassModal
      isOpen
      onClose={onClose}
      title="Editor sperimentale Grid Engine 2.0"
      eyebrow="DEV · sessione isolata · sola memoria"
      description="La griglia operativa resta montata e invariata. Chiudendo questa finestra ogni prova viene eliminata."
      variant="fullscreen"
      zIndex={320}
      closeLabel="Chiudi esperimento Grid Engine 2.0"
      panelClassName="bg-[#07101b]"
      bodyClassName="mt-4"
    >
      <div data-testid="grid-editor-preview" className="space-y-4 pb-6">
        <section
          aria-label="Stato della snapshot di anteprima"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4">
            <div className="flex items-center gap-2 text-cyan-100/65">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Baseline</p>
            </div>
            <p data-testid="editor-preview-baseline" className="mt-2 text-sm font-semibold text-white/88">
              {baselineLabel(model.baseline.kind)}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Geometria {model.baseline.geometry}; autorità di preview: nessuna.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-white/58">
              <Layers3 className="h-4 w-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Inventario root</p>
            </div>
            <p data-testid="editor-preview-inventory" className="mt-2 text-sm font-semibold text-white/88">
              {model.inventory.rootElementCount} elementi · {model.inventory.stackContainerCount} Stack
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {model.inventory.stackChildCount} figli Stack esclusi · {model.inventory.specialSectionCount} sezioni speciali
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-white/58">
              <Database className="h-4 w-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Sorgente</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-white/88">
              {model.baseline.source.source} · {model.baseline.source.phase}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Revisione {model.baseline.source.revision ?? 'n/d'} · storage {model.baseline.source.storageVersion ?? session.dashboard.storageVersion}
            </p>
          </div>
          <div className={`rounded-2xl border p-4 ${
            initialStatus.state === 'complete'
              ? 'border-emerald-300/15 bg-emerald-300/[0.05]'
              : 'border-amber-300/20 bg-amber-300/[0.06]'
          }`}>
            <div className="flex items-center gap-2 text-white/58">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Breakpoint iniziale</p>
            </div>
            <p data-testid="editor-preview-breakpoint-status" className="mt-2 text-sm font-semibold text-white/88">
              {initialStatus.breakpoint.toUpperCase()} · {initialStatus.state}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {initialStatus.cols} colonne · {initialStatus.validItemCount} root validi su {initialStatus.itemCount} coordinate sorgente
            </p>
          </div>
        </section>

        <details
          data-testid="editor-geometry-audit"
          className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 text-white/65"
        >
          <summary className="cursor-pointer text-sm font-semibold text-cyan-50/90">
            Audit geometrico editor · ID, titoli e sorgenti
          </summary>
          <div className="mt-4 space-y-4 text-xs leading-5">
            <p data-testid="editor-geometry-capture-status">
              {model.geometryAudit.editorCaptureAvailable
                ? `Geometria effettiva RGL catturata in ${model.geometryAudit.capturedBreakpoint?.toUpperCase()} a ${Math.round(model.geometryAudit.capturedGridWidth ?? 0)} px.`
                : 'Geometria effettiva RGL non disponibile: BEFORE usa soltanto il draft esplicito e resta non verificato.'}
              {' '}Snapshot persistita HA: {model.geometryAudit.persistedSnapshotAvailable ? 'disponibile' : 'non disponibile'}.
            </p>
            <p className="text-white/48">
              Editor = input effettivo fornito alla griglia operativa. Draft = coordinate responsive correnti in React.
              HA = ultima snapshot strutturale caricata. BEFORE = baseline aperta nel laboratorio; AFTER coincide con
              BEFORE finché non viene eseguita un’operazione locale.
            </p>

            <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
              <table className="min-w-full text-left">
                <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-white/45">
                  <tr>
                    <th className="px-3 py-2">Titolo / ID</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Ruolo</th>
                    <th className="px-3 py-2">Rappresentazione</th>
                  </tr>
                </thead>
                <tbody>
                  {model.inventoryEntries.map((entry) => (
                    <tr key={`${entry.role}:${entry.id}`} data-testid={`editor-inventory-${entry.id}`} className="border-t border-white/[0.06]">
                      <td className="px-3 py-2">
                        <strong className="block text-white/82">{entry.title}</strong>
                        <code className="text-[10px] text-cyan-100/60">{entry.id}</code>
                      </td>
                      <td className="px-3 py-2">{entry.kind}</td>
                      <td className="px-3 py-2">
                        {entry.role}{entry.parentId ? ` · parent ${entry.parentId}` : ''}
                      </td>
                      <td className="px-3 py-2">{entry.previewRepresentation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
              const audit = model.geometryAudit.breakpoints[breakpoint];
              const aligned = audit.editorGeometryValid
                && audit.homeOnlyIds.length === 0
                && audit.previewOnlyIds.length === 0
                && audit.rows.every((row) => row.editor && row.before
                  && formatGeometry(row.editor) === formatGeometry(row.before));
              return (
                <details
                  key={breakpoint}
                  data-testid={`editor-geometry-breakpoint-${breakpoint}`}
                  open={breakpoint === session.initialBreakpoint}
                  className="rounded-xl border border-white/[0.07] bg-black/10 p-3"
                >
                  <summary className="cursor-pointer font-semibold text-white/78">
                    {breakpoint.toUpperCase()} · {audit.source} · Home {audit.operationalRootCount} / Preview {audit.previewRootCount}
                    {' · '}{aligned ? 'editor/BEFORE allineati' : 'verifica richiesta'}
                  </summary>
                  <p className="mt-2 text-white/48">
                    In entrambi: {audit.sharedIds.length} · Solo Home: {audit.homeOnlyIds.length} · Solo preview: {audit.previewOnlyIds.length}
                  </p>
                  {(audit.homeOnlyIds.length > 0 || audit.previewOnlyIds.length > 0) ? (
                    <p className="mt-2 text-amber-100/75">
                      Solo Home: {audit.homeOnlyIds.join(', ') || 'nessuno'} · Solo preview: {audit.previewOnlyIds.join(', ') || 'nessuno'}
                    </p>
                  ) : null}
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-[980px] text-left">
                      <thead className="text-[10px] uppercase tracking-[0.1em] text-white/42">
                        <tr>
                          <th className="px-2 py-1">Elemento</th>
                          <th className="px-2 py-1">Home / Editor</th>
                          <th className="px-2 py-1">Draft</th>
                          <th className="px-2 py-1">HA</th>
                          <th className="px-2 py-1">BEFORE</th>
                          <th className="px-2 py-1">AFTER</th>
                          <th className="px-2 py-1">Stato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.rows.map((row) => (
                          <tr
                            key={row.id}
                            data-testid={`editor-geometry-row-${breakpoint}-${row.id}`}
                            data-editor={formatGeometry(row.editor)}
                            data-draft={formatGeometry(row.draft)}
                            data-persisted={formatGeometry(row.persisted)}
                            data-before={formatGeometry(row.before)}
                            data-after={formatGeometry(row.after)}
                            className="border-t border-white/[0.055]"
                          >
                            <td className="px-2 py-2">
                              <strong className="block text-white/80">{row.title}</strong>
                              <code className="text-[10px] text-cyan-100/55">{row.id}</code>
                            </td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.editor)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.draft)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.persisted)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.before)}</td>
                            <td className="px-2 py-2 font-mono">{formatGeometry(row.after)}</td>
                            <td className="px-2 py-2">
                              {row.status} · {row.alignment}
                              {row.mismatches.length > 0 ? ` · ${row.mismatches.join(', ')}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        </details>

        <GridStructuralAdoptionPanel
          {...adoptionReview}
          initialBreakpoint={session.initialBreakpoint}
        />

        {model.scenario ? (
          <GridEngineLab
            scenarios={[model.scenario]}
            initialBreakpoint={session.initialBreakpoint}
            presentation="editor-preview"
            draftReview={draftReview}
            renderItem={({ item, selected, breakpoint }) => (
              <GridEditorRealCard
                dashboard={session.dashboard}
                visualWidgets={session.visualWidgets}
                dashboardState={session.dashboardState}
                haStates={session.haStates}
                sensorHistoryByEntity={session.sensorHistoryByEntity}
                houseMembers={session.houseMembers}
                item={item}
                breakpoint={breakpoint}
                selected={selected}
              />
            )}
            context={(
              <div className="grid gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.045] p-4 text-xs leading-5 text-white/56 md:grid-cols-3">
                <p>
                  <strong className="block text-amber-100/85">Policy preview-only</strong>
                  Manuale è il valore iniziale locale. Nessuna Policy V1 viene letta, creata o salvata.
                </p>
                <p>
                  <strong className="block text-amber-100/85">Limiti della baseline</strong>
                  {model.unknownLegacyIds.length > 0
                    ? `${model.unknownLegacyIds.length} ID legacy sconosciuti; i breakpoint coinvolti restano non autorevoli.`
                    : 'Nessun ID legacy sconosciuto. I breakpoint mancanti o incompleti restano non confermabili.'}
                </p>
                <p>
                  <strong className="block text-amber-100/85">Runtime e dispositivi</strong>
                  Gli span runtime già passati a RGL sono mostrati in Editor; le misure DOM in pixel restano escluse.
                  L’espansione Light nel laboratorio è simulata e non invia comandi HA.
                </p>
              </div>
            )}
          />
        ) : (
          <div role="alert" className="rounded-2xl border border-rose-300/25 bg-rose-300/[0.08] p-5 text-sm text-rose-50/85">
            La configurazione non contiene una geometria root canonica valida. La preview non inventa coordinate sostitutive.
          </div>
        )}

        <div className="pointer-events-none sticky bottom-3 z-40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-[#0b1624]/95 px-4 text-sm font-semibold text-white/82 shadow-2xl backdrop-blur-xl transition hover:border-cyan-200/30 hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Chiudi esperimento
          </button>
        </div>
      </div>
    </GlassModal>
  );
}

export default GridEditorPreviewDialog;
