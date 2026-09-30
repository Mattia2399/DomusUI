// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gridCanvasSource = readFileSync(
  resolve(process.cwd(), 'src/components/dashboard/GridCanvas.tsx'),
  'utf8',
);

describe('GridCanvas lazy Builder catalog', () => {
  it('keeps the catalog and its heavy dropdown dependencies outside the runtime canvas', () => {
    expect(gridCanvasSource).toContain(
      "const loadDashboardCatalogModal = () => import('./DashboardCatalogModal')",
    );
    expect(gridCanvasSource).toContain(
      'const DashboardCatalogModal = React.lazy(loadDashboardCatalogModal)',
    );
    expect(gridCanvasSource).toContain('{isEditMode && isCatalogOpen ? (');
    expect(gridCanvasSource).toContain('<LazyLoadBoundary');
    expect(gridCanvasSource).not.toContain("from '../ui/GlassDropdown'");
    expect(gridCanvasSource).not.toContain("from '../ui/GlassSearchFilterBar'");
  });
});
