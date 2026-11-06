import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('the piece of the editor', () => {
  it('is only loaded by the sidebar, apart, when a card is edited', () => {
    const sidebar = read('../dashboard/RightSidebarManager.tsx');
    expect(sidebar).toContain("React.lazy(() => import('../panelEditor/PanelEditor'))");
    expect(sidebar).not.toMatch(/^import[^\n]*panelEditor\//m);
  });

  it('no page that opens panels imports it', () => {
    for (const path of ['../devices/panels/Panel.tsx', '../devices/panels/PanelView.tsx', '../devices/panels/related/relatedPanelControls.tsx', '../settings/ContextSidebar.tsx', '../../pages/rooms/RoomsPage.tsx', '../dashboard/MainBoard.tsx']) {
      expect(read(path)).not.toMatch(/from '[^']*panelEditor\//);
    }
  });
});
