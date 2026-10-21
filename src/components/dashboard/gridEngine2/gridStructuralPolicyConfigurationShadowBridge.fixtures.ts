import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridStructuralPolicyLineageEvidence } from './gridStructuralPolicyConfigurationInspection';
import type { GridStructuralPolicyConfigurationShadowBridgeInput } from './gridStructuralPolicyConfigurationShadowBridge';
import {
  analyzeGridStructuralPolicyShadow,
  GRID_STRUCTURAL_POLICY_SHADOW_COLS,
  type GridStructuralPolicyShadowInput,
} from './gridStructuralPolicyShadowAdapter';
import {
  createStructuralPolicyShadowFixture,
} from './gridStructuralPolicyShadowAdapter.fixtures';
import { evaluateRuntimeShadowBaseline } from './runtimeShadowBaseline';

type BridgeFixtureOptions = Readonly<{
  policy?: unknown;
  requestedBreakpoint?: DashboardGridBreakpoint;
  shadow?: Parameters<typeof createStructuralPolicyShadowFixture>[0];
  snapshotCoherent?: boolean;
  applicationReceipt?: GridStructuralPolicyConfigurationShadowBridgeInput['applicationReceipt'];
  lineageEvidence?: GridStructuralPolicyLineageEvidence;
}>;

function receiptFor(input: GridStructuralPolicyShadowInput) {
  return input.snapshotState === 'verified-home-assistant' &&
    input.configurationCompleteness === 'verified-complete'
    ? 'verified-match' as const
    : 'missing' as const;
}

export function createGridStructuralPolicyConfigurationShadowBridgeFixture(
  options: BridgeFixtureOptions = {},
): GridStructuralPolicyConfigurationShadowBridgeInput {
  const shadow = createStructuralPolicyShadowFixture(options.shadow);
  const requestedBreakpoint = options.requestedBreakpoint ?? 'xl';
  const analysis = analyzeGridStructuralPolicyShadow({
    ...shadow,
    activeBreakpoint: requestedBreakpoint,
  });
  const hasExplicitLayout = Object.prototype.hasOwnProperty.call(
    shadow.structuralLayouts ?? {},
    requestedBreakpoint,
  );
  const policy = Object.prototype.hasOwnProperty.call(options, 'policy')
    ? options.policy
    : undefined;
  return {
    policy,
    requestedBreakpoint,
    structuralContext: shadow.structuralContext,
    snapshotState: shadow.snapshotState,
    snapshotCoherent: options.snapshotCoherent ?? shadow.snapshotState === 'verified-home-assistant',
    applicationReceipt: options.applicationReceipt ?? receiptFor(shadow),
    configurationCompleteness: shadow.configurationCompleteness,
    breakpointProjection: analysis.report.breakpoints[requestedBreakpoint],
    activeBaseline: evaluateRuntimeShadowBaseline({
      breakpoint: requestedBreakpoint,
      cols: GRID_STRUCTURAL_POLICY_SHADOW_COLS[requestedBreakpoint],
      rootElements: shadow.rootElements,
      hasExplicitLayout,
      explicitLayout: shadow.structuralLayouts?.[requestedBreakpoint],
    }),
    ...(options.lineageEvidence ? { lineageEvidence: options.lineageEvidence } : null),
  };
}
