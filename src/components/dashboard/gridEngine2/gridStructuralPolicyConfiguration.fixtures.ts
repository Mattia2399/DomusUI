import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridScope } from './gridStructuralPolicy';
import {
  GRID_GENERATED_GEOMETRY_LINEAGE_VERSION,
  GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION,
  type GridPolicyBreakpointOverrideV1,
  type GridPolicyChoiceDeclarationV1,
  type GridPolicyGeometryDeclarationV1,
  type GridStructuralPolicyConfigurationV1,
} from './gridStructuralPolicyConfiguration';

export const SYNTHETIC_ROOT_SCOPE: GridScope = { kind: 'root' };
export const SYNTHETIC_GROUP_SCOPE: GridScope = { kind: 'group', id: 'group.synthetic-a' };

export function choiceDeclaration(
  declarationId: string,
  mode: 'manual' | 'automatic' = 'automatic',
  origin: 'user-explicit' | 'creation-default-confirmed' = 'user-explicit',
): GridPolicyChoiceDeclarationV1 {
  return { declarationId, mode, origin, confirmation: 'confirmed' };
}

export function explicitGeometry(
  breakpoint: DashboardGridBreakpoint,
  policyDeclarationId = 'choice.root',
  declarationId = `geometry.${breakpoint}.explicit`,
): GridPolicyGeometryDeclarationV1 {
  return {
    declarationId,
    policyDeclarationId,
    breakpoint,
    origin: 'explicit',
  };
}

export function generatedGeometry(
  breakpoint: DashboardGridBreakpoint,
  options: Readonly<{
    scope?: GridScope;
    policyDeclarationId?: string;
    sourceBreakpoint?: DashboardGridBreakpoint;
    sourceGeometryDeclarationId?: string;
  }> = {},
): GridPolicyGeometryDeclarationV1 {
  return {
    declarationId: `geometry.${breakpoint}.generated`,
    policyDeclarationId: options.policyDeclarationId ?? 'choice.root',
    breakpoint,
    origin: 'generated',
    lineage: {
      version: GRID_GENERATED_GEOMETRY_LINEAGE_VERSION,
      algorithmId: 'grid-engine2-responsive',
      algorithmVersion: '1.0.0',
      sourceBreakpoint: options.sourceBreakpoint ?? 'xl',
      sourceScope: options.scope ?? SYNTHETIC_ROOT_SCOPE,
      sourceGeometryDeclarationId: options.sourceGeometryDeclarationId ?? 'geometry.xl.explicit',
      sourceStructuralFingerprint: 'structure-v1-a1b2c3',
      sourceInventoryFingerprint: 'inventory-v1-d4e5f6',
      sourceStructuralVersion: 14,
    },
  };
}

export function manualMobileOverride(): GridPolicyBreakpointOverrideV1 {
  return {
    breakpoint: 'xs',
    declaration: choiceDeclaration('choice.root.xs', 'manual'),
  };
}

export function createGridStructuralPolicyConfigurationFixture(
  overrides: Partial<GridStructuralPolicyConfigurationV1> = {},
): GridStructuralPolicyConfigurationV1 {
  return {
    version: GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION,
    scope: SYNTHETIC_ROOT_SCOPE,
    referenceBreakpoint: 'xl',
    primary: choiceDeclaration('choice.root'),
    overrides: [],
    geometries: [
      explicitGeometry('xl'),
      generatedGeometry('2xl'),
      generatedGeometry('lg'),
      generatedGeometry('md'),
      generatedGeometry('sm'),
      generatedGeometry('xs'),
    ],
    ...overrides,
  };
}

export function createGroupPolicyConfigurationFixture(): GridStructuralPolicyConfigurationV1 {
  return createGridStructuralPolicyConfigurationFixture({
    scope: SYNTHETIC_GROUP_SCOPE,
    primary: choiceDeclaration('choice.group'),
    geometries: [
      explicitGeometry('xl', 'choice.group', 'geometry.group.xl.explicit'),
      generatedGeometry('xs', {
        scope: SYNTHETIC_GROUP_SCOPE,
        policyDeclarationId: 'choice.group',
        sourceGeometryDeclarationId: 'geometry.group.xl.explicit',
      }),
    ],
  });
}
