import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('the Rooms show each device as the registry recommends', () => {
  it('they give the panels no related controls and read no card of the Home', () => {
    const rooms = read('./RoomsPage.tsx');
    expect(rooms).not.toContain('RelatedContext');
    expect(rooms).not.toContain('relatedHomeSource');
    expect(rooms).not.toContain('DEMO_RELATED_STATES');
  });

  it('only the Home gives them, with the icons chosen in its edit mode', () => {
    const home = read('../../components/settings/ContextSidebar.tsx');
    expect(home).toContain('<HomePanel {...homePanelProps} related={related} />');
    expect(read('../../components/settings/HomePanel.tsx')).toContain('iconOf: chosenIconOf');
    expect(read('../../components/devices/panels/Panel.tsx')).not.toMatch(/import \{[^}]*RelatedContext[^}]*\} from/);
  });
});
