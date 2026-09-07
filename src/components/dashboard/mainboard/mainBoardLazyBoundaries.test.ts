// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainBoardSource = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/MainBoard.tsx'),
  'utf8',
);

describe('MainBoard lazy boundaries', () => {
  it('keeps secondary routes out of the initial Home module graph', () => {
    const secondaryModules = [
      ['loadConsumptionDashboard', '../../pages/Consumi'],
      ['loadAutomationsBuilder', '../../pages/AutomationsBuilder'],
      ['loadAppGallery', '../../pages/AppGallery'],
      ['loadRoomsDashboard', '../../pages/RoomsDashboard'],
      ['loadSecurityDashboard', '../../pages/SecurityDashboard'],
      ['loadSettingsDashboard', '../../pages/SettingsDashboard'],
      ['loadConsumptionEditor', '../settings/ConsumptionEditorSidebar'],
    ];

    for (const [loaderName, modulePath] of secondaryModules) {
      expect(mainBoardSource).toContain(`const ${loaderName} = () => import('${modulePath}')`);
      expect(mainBoardSource).toContain(`React.lazy(${loaderName})`);
      expect(mainBoardSource).not.toContain(`from '${modulePath}'`);
    }
  });

  it('loads the modern profile only while the profile is open', () => {
    expect(mainBoardSource).toContain("const loadModernProfilePage = () =>");
    expect(mainBoardSource).toContain("import('../settings/ModernProfilePage').then");
    expect(mainBoardSource).toContain(
      'const ModernProfilePage = React.lazy(loadModernProfilePage)',
    );
    expect(mainBoardSource).toContain('{isProfileOpen ? (');
    expect(mainBoardSource).toContain('<React.Suspense fallback={<SecondaryWorkspaceLoading label="Apertura profilo…" overlay />}>');
  });

  it('loads the Settings management container only for nested Settings pages', () => {
    expect(mainBoardSource).toContain('const loadSettingsManagementPanel = () =>');
    expect(mainBoardSource).toContain(
      "import('../settings/SettingsManagementPanel').then",
    );
    expect(mainBoardSource).toContain(
      'const SettingsManagementPanel = React.lazy(loadSettingsManagementPanel)',
    );
  });

  it('loads the Builder and device context manager only when requested', () => {
    expect(mainBoardSource).toContain('const loadRightSidebarManager = () =>');
    expect(mainBoardSource).toContain("import('./RightSidebarManager').then");
    expect(mainBoardSource).toContain('const RightSidebarManager = React.lazy(loadRightSidebarManager)');
    expect(mainBoardSource).not.toContain("import { RightSidebarManager } from './RightSidebarManager'");
    expect(mainBoardSource).toContain('{isEditMode || activeDevice ? (');
    expect(mainBoardSource).toContain(
      '<DashboardSidebarPlaceholder isCompactViewport={isCompactViewport} />',
    );
  });

  it('loads rare dashboard overlays only when their flows are requested', () => {
    const overlayModules = [
      ['loadGuidedSetupOverlay', '../settings/GuidedSetupOverlay'],
      ['loadSecurityAuthModal', '../security/SecurityAuthModal'],
      ['loadDashboardRecoveryModal', './DashboardRecoveryModal'],
    ];

    for (const [loaderName, modulePath] of overlayModules) {
      expect(mainBoardSource).toContain(`const ${loaderName} = () => import('${modulePath}')`);
      expect(mainBoardSource).toContain(`React.lazy(${loaderName})`);
    }

    expect(mainBoardSource).not.toContain(
      "import SecurityAuthModal from '../security/SecurityAuthModal'",
    );
    expect(mainBoardSource).not.toContain(
      "import { DashboardRecoveryModal } from './DashboardRecoveryModal'",
    );
    expect(mainBoardSource).toContain(
      '{isQuickSecurityAuthOpen || hasMountedQuickSecurityAuth ? (',
    );
    expect(mainBoardSource).toContain('setHasMountedQuickSecurityAuth(true)');
    expect(mainBoardSource).toContain('{visibleDashboardRecovery ? (');
  });

  it('prefetches lazy workspaces from navigation intent while delaying visible fallbacks', () => {
    expect(mainBoardSource).toContain('function prefetchDashboardWorkspace(path: string)');
    expect(mainBoardSource).toContain('onPrefetchRoute={prefetchDashboardWorkspace}');
    expect(mainBoardSource).toContain('onPrefetchEditMode={() => void loadRightSidebarManager()}');
    expect(mainBoardSource).toContain("import DeferredGlassLoader from '../ui/DeferredGlassLoader'");
  });

  it('keeps a local Suspense boundary around secondary workspaces', () => {
    expect(mainBoardSource).toContain(
      '<React.Suspense fallback={<SecondaryWorkspaceLoading />}>',
    );
    expect(mainBoardSource).toContain("description={t('home.loading.tools')}");
  });
});
