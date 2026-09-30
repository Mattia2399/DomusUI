// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rightSidebarSource = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/RightSidebarManager.tsx'),
  'utf8',
);

describe('RightSidebarManager lazy device context', () => {
  it('keeps device-only controls and charts outside the Builder chunk', () => {
    expect(rightSidebarSource).toContain(
      "import('../settings/ContextSidebar').then",
    );
    expect(rightSidebarSource).toContain(
      'const ContextSidebar = React.lazy(loadContextSidebar)',
    );
    expect(rightSidebarSource).not.toContain(
      "import { ContextSidebar } from '../settings/ContextSidebar'",
    );
    expect(rightSidebarSource).toContain('<LazyLoadBoundary');
    expect(rightSidebarSource).toContain('resetKey={activeDeviceForPanel?.id}');
    expect(rightSidebarSource).toContain(
      "import('../widgets/micro/MicroSuperChart').then",
    );
    expect(rightSidebarSource).not.toContain(
      "import { MicroSuperChart } from '../widgets/micro/MicroSuperChart'",
    );
    expect(rightSidebarSource).toContain(
      "from '../settings/climateControlLabels'",
    );
    expect(rightSidebarSource).not.toContain(
      "from '../settings/ClimateControls'",
    );
  });
});
