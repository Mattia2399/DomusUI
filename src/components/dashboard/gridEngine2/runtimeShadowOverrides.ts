/**
 * Compatibility facade for the existing Runtime Shadow call sites.
 * New editor integration must import the neutral Grid Engine module directly.
 */
export {
  deriveGridEngineRuntimeOverrides as deriveRuntimeShadowOverrides,
} from './gridEngineRuntimeOverrides';
export type {
  GridEngineRuntimeLightState as RuntimeShadowLightState,
  GridEngineRuntimeOverrideInput as RuntimeShadowOverrideInput,
  GridEngineRuntimeOverrideIssue as RuntimeShadowOverrideIssue,
  GridEngineRuntimeOverrideIssueCode as RuntimeShadowOverrideIssueCode,
  GridEngineRuntimeOverrideResult as RuntimeShadowOverrideResult,
} from './gridEngineRuntimeOverrides';
