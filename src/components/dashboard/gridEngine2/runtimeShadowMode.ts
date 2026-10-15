import {
  analyzeRuntimeShadow,
  createRuntimeShadowInputSignature,
  type RuntimeShadowInput,
  type RuntimeShadowReport,
} from './runtimeShadowDiagnostics';
import {
  fingerprintRuntimeShadowId,
  type RuntimeShadowIdFinding,
} from './runtimeShadowIdAudit';

export const GRID_ENGINE_2_RUNTIME_SHADOW_LOG_PREFIX = '[DomusUI:grid-engine2:runtime-shadow]';

type RuntimeShadowLogger = {
  readonly info: (message: string, details: unknown) => void;
  readonly warn: (message: string, details: unknown) => void;
};

type RuntimeShadowRunnerOptions = {
  readonly enabled: boolean;
  readonly previousSignature?: string | null;
  readonly logger?: RuntimeShadowLogger;
  readonly now?: () => number;
  readonly analyze?: (input: RuntimeShadowInput) => RuntimeShadowReport;
};

export type RuntimeShadowRunnerResult =
  | { readonly status: 'disabled'; readonly nextSignature: null }
  | { readonly status: 'unchanged'; readonly nextSignature: string }
  | { readonly status: 'reported'; readonly nextSignature: string; readonly report: RuntimeShadowReport }
  | { readonly status: 'failed'; readonly nextSignature: string; readonly errorMessage: string };

function safeLog(logger: RuntimeShadowLogger, level: 'info' | 'warn', details: unknown) {
  try {
    logger[level](GRID_ENGINE_2_RUNTIME_SHADOW_LOG_PREFIX, details);
  } catch {
    // Diagnostics must remain observational even when a console adapter fails.
  }
}

function compactIdFinding(finding: RuntimeShadowIdFinding) {
  return {
    fingerprint: finding.fingerprint,
    category: finding.category,
    evidence: finding.evidence,
    ...(finding.rawId === undefined ? null : { rawId: finding.rawId }),
  };
}

function compactIdAudit(report: RuntimeShadowReport) {
  const audit = report.baselineIdAudit;
  return {
    structuralIds: audit.structuralIds,
    recognizedRootIds: audit.recognizedRootIds,
    renderedRootIds: audit.renderedRootIds,
    unknownIdsCount: audit.unknownIdsCount,
    unknownIdOccurrences: audit.unknownIdOccurrences,
    missingIdsCount: audit.missingIdsCount,
    missingIdOccurrences: audit.missingIdOccurrences,
    unknownCategories: audit.unknownCategories,
    unknownIdGroups: audit.unknownIdGroups.map((finding) => ({
      ...compactIdFinding(finding),
      breakpoints: finding.breakpoints,
    })),
    affectedBreakpoints: audit.affectedBreakpoints,
    breakpoints: Object.fromEntries(
      Object.entries(audit.breakpoints).map(([breakpoint, current]) => [breakpoint, {
        hasExplicitStructuralLayout: current.hasExplicitStructuralLayout,
        counts: {
          structuralItems: current.structuralIds.itemCount,
          structuralUnique: current.structuralIds.uniqueIdCount,
          recognizedItems: current.recognizedRootIds.itemCount,
          recognizedUnique: current.recognizedRootIds.uniqueIdCount,
          renderedItems: current.renderedRootIds.itemCount,
          renderedUnique: current.renderedRootIds.uniqueIdCount,
        },
        ids: {
          structural: current.structuralIds.ids.map(compactIdFinding),
          recognized: current.recognizedRootIds.ids.map(compactIdFinding),
          rendered: current.renderedRootIds.ids.map(compactIdFinding),
        },
        structuralNotRecognized: current.structuralNotRecognized.map(compactIdFinding),
        recognizedNotStructural: current.recognizedNotStructural.map(compactIdFinding),
        recognizedNotRendered: current.recognizedNotRendered.map(compactIdFinding),
        renderedNotRecognized: current.renderedNotRecognized.map(compactIdFinding),
        duplicates: {
          structural: current.structuralIds.duplicates.map((finding) => ({
            ...compactIdFinding(finding), occurrences: finding.occurrences,
          })),
          recognized: current.recognizedRootIds.duplicates.map((finding) => ({
            ...compactIdFinding(finding), occurrences: finding.occurrences,
          })),
          rendered: current.renderedRootIds.duplicates.map((finding) => ({
            ...compactIdFinding(finding), occurrences: finding.occurrences,
          })),
        },
        normalizationDifferences: current.normalizationDifferences.map(({ left, right }) => ({
          left: compactIdFinding(left),
          right: compactIdFinding(right),
        })),
        unknownCategories: current.unknownCategories,
      }]),
    ),
  };
}

function compactGeometry(item: RuntimeShadowReport['differences'][number]['candidate']) {
  if (!item) return undefined;
  return { x: item.x, y: item.y, w: item.w, h: item.h, index: item.index };
}

function compactReconciliation(report: RuntimeShadowReport) {
  const reconciliation = report.reconciliation;
  return {
    originalBaselineQuality: reconciliation.originalBaselineQuality,
    status: reconciliation.status,
    reason: reconciliation.reason,
    reconciledBaselineQuality: reconciliation.reconciledBaselineQuality,
    extraIdsCount: reconciliation.extraIdsCount,
    classifiedNestedCount: reconciliation.classifiedNestedCount,
    classifiedAbsentCount: reconciliation.classifiedAbsentCount,
    uncertainCount: reconciliation.uncertainCount,
    excludedFromDiagnosticProjectionCount: reconciliation.excludedFromDiagnosticProjectionCount,
    originalIssues: reconciliation.originalIssues,
    remainingIssues: reconciliation.remainingIssues,
    confidence: reconciliation.comparisonConfidence,
    classifications: reconciliation.classifications.map((classification) => ({
      fingerprint: classification.fingerprint,
      classification: classification.classification,
      evidence: classification.evidence,
      parentRole: classification.parentRole,
      safeForDiagnosticProjection: classification.safeForDiagnosticProjection,
      ...(classification.rawId === undefined ? null : { rawId: classification.rawId }),
    })),
  };
}

function compactPayload(report: RuntimeShadowReport, signature: string) {
  const categoryCounts: Record<string, number> = {};
  report.differences.forEach((difference) => {
    difference.categories.forEach((category) => {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    });
  });
  return {
    event: 'report',
    signature,
    breakpoint: report.breakpoint,
    cols: report.cols,
    baseline: {
      quality: report.baseline.quality,
      provenance: report.baseline.provenance,
      confidence: report.comparisonConfidence,
    },
    counts: {
      roots: report.rootElementCount,
      lights: report.lightCount,
      stacks: report.stackCount,
      overrides: report.overrideCount,
      appliedOverrides: report.appliedOverrideCount,
      matches: report.matchCount,
      differences: report.differences.length,
      insufficient: report.insufficientCount,
    },
    solver: report.solverStatus,
    comparison: report.comparison,
    categories: categoryCounts,
    issues: [...new Set(report.issueCodes)].sort(),
    differences: report.differences.slice(0, 12).map((difference) => ({
      idFingerprint: fingerprintRuntimeShadowId(difference.id),
      categories: difference.categories,
      candidate: compactGeometry(difference.candidate),
      legacyRuntimeInput: compactGeometry(difference.legacyRuntimeInput),
      reason: difference.reason,
    })),
    omittedDifferences: Math.max(0, report.differences.length - 12),
    limitations: report.baseline.limitations,
    baselineIdAudit: compactIdAudit(report),
    reconciliation: compactReconciliation(report),
    timings: report.timings,
    reference: 'legacy-runtime-input',
  };
}

/** Disabled and duplicate calls return before analysis and never log. */
export function runGridEngine2RuntimeShadowMode(
  input: RuntimeShadowInput,
  options: RuntimeShadowRunnerOptions,
): RuntimeShadowRunnerResult {
  if (!options.enabled) return { status: 'disabled', nextSignature: null };
  const signature = createRuntimeShadowInputSignature(input);
  if (signature === options.previousSignature) return { status: 'unchanged', nextSignature: signature };

  const logger = options.logger ?? console;
  try {
    const report = options.analyze
      ? options.analyze(input)
      : analyzeRuntimeShadow(input, { now: options.now });
    safeLog(logger, 'info', compactPayload(report, signature));
    return { status: 'reported', nextSignature: signature, report };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    safeLog(logger, 'warn', { event: 'error', signature, message: 'runtime-shadow-analysis-failed' });
    return { status: 'failed', nextSignature: signature, errorMessage };
  }
}
