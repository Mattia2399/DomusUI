import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridScope } from './gridStructuralPolicy';
import {
  createGridStructuralPolicyConfigurationFixture,
  SYNTHETIC_ROOT_SCOPE,
} from './gridStructuralPolicyConfiguration.fixtures';
import type {
  GridStructuralPolicyAlgorithmRegistryEvidence,
  GridStructuralPolicyGeometryEvidence,
  GridStructuralPolicyInventoryEvidence,
  GridStructuralPolicyLineageEvidence,
  GridStructuralPolicySnapshotEvidence,
  InspectGridStructuralPolicyConfigurationInput,
} from './gridStructuralPolicyConfigurationInspection';

export const SYNTHETIC_VERIFIED_SNAPSHOT: GridStructuralPolicySnapshotEvidence = {
  state: 'verified-home-assistant',
  coherent: true,
  generation: 7,
  revision: 14,
  diagnosticFingerprint: 'dsl-v1-synthetic-session-context',
  applicationReceipt: 'verified-match',
};

export const SYNTHETIC_VERIFIED_INVENTORY: GridStructuralPolicyInventoryEvidence = {
  completeness: 'verified-complete',
  activeCount: 3,
  verifiedAbsentCount: 0,
  uncertainCount: 0,
  duplicateIdCount: 0,
  activeWithoutGeometryCount: 0,
  stackContainerCount: 1,
};

export const SYNTHETIC_COMPLETE_GEOMETRY: GridStructuralPolicyGeometryEvidence = {
  completeness: 'explicit-complete',
  baselineTrust: 'authoritative',
  outOfBoundsCount: 0,
  collisionCount: 0,
};

export const SYNTHETIC_SUPPORTED_ALGORITHM: GridStructuralPolicyAlgorithmRegistryEvidence = {
  evidenceSource: 'authoritative-algorithm-registry',
  algorithmId: 'grid-engine2-responsive',
  algorithmVersion: '1.0.0',
  support: 'supported',
};

export function createSyntheticCompleteLineageEvidence(
  scope: GridScope = SYNTHETIC_ROOT_SCOPE,
): GridStructuralPolicyLineageEvidence {
  return {
    sourceGeometry: {
      evidenceSource: 'persisted-geometry-declaration',
      declarationId: scope.kind === 'root' ? 'geometry.xl.explicit' : 'geometry.group.xl.explicit',
      scope,
      breakpoint: 'xl',
      completeness: 'complete',
    },
    algorithmRegistry: SYNTHETIC_SUPPORTED_ALGORITHM,
    sourceStructuralFingerprint: {
      evidenceSource: 'independent-source-geometry',
      value: 'structure-v1-a1b2c3',
    },
    sourceInventoryFingerprint: {
      evidenceSource: 'independent-structural-inventory',
      value: 'inventory-v1-d4e5f6',
    },
    sourceStructuralVersion: {
      evidenceSource: 'persisted-structural-version',
      value: 14,
    },
  };
}

type InspectionFixtureOptions = Readonly<{
  policy?: unknown;
  requestedScope?: GridScope;
  requestedBreakpoint?: DashboardGridBreakpoint;
  structuralContext?: GridStructuralPolicySnapshotEvidence;
  inventoryEvidence?: GridStructuralPolicyInventoryEvidence;
  geometryEvidence?: GridStructuralPolicyGeometryEvidence;
  lineageEvidence?: GridStructuralPolicyLineageEvidence;
}>;

export function createGridStructuralPolicyInspectionFixture(
  options: InspectionFixtureOptions = {},
): InspectGridStructuralPolicyConfigurationInput {
  const policy = Object.prototype.hasOwnProperty.call(options, 'policy')
    ? options.policy
    : createGridStructuralPolicyConfigurationFixture();
  return {
    policy,
    requestedScope: options.requestedScope ?? SYNTHETIC_ROOT_SCOPE,
    requestedBreakpoint: options.requestedBreakpoint ?? 'xl',
    structuralContext: options.structuralContext ?? SYNTHETIC_VERIFIED_SNAPSHOT,
    inventoryEvidence: options.inventoryEvidence ?? SYNTHETIC_VERIFIED_INVENTORY,
    geometryEvidence: options.geometryEvidence ?? SYNTHETIC_COMPLETE_GEOMETRY,
    ...(options.lineageEvidence ? { lineageEvidence: options.lineageEvidence } : null),
  };
}
