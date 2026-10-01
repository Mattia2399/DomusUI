// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Members location map lazy boundary', () => {
  it('keeps MapLibre outside the application entry and the regular context panel', () => {
    const entry = readSource('src/main.tsx');
    const mainBoard = readSource('src/components/dashboard/MainBoard.tsx');
    const contextSidebar = readSource('src/components/settings/ContextSidebar.tsx');

    expect(entry).not.toContain('maplibre-gl');
    expect(mainBoard).not.toContain('@vis.gl/react-maplibre');
    expect(contextSidebar).not.toContain("from '@vis.gl/react-maplibre'");
    expect(contextSidebar).toContain("const loadMembersLocationMap = () => import('./MembersLocationMap')");
    expect(contextSidebar).toContain('membersMapPoints.length > 0 ? (');
    expect(contextSidebar).toContain('<MembersLocationMap points={membersMapPoints} theme={theme} />');
  });

  it('loads the MapLibre runtime and stylesheet only inside the dedicated map chunk', () => {
    const map = readSource('src/components/settings/MembersLocationMap.tsx');

    expect(map).toContain("import('./maplibreRuntime')");
    expect(map).toContain("import 'maplibre-gl/dist/maplibre-gl.css'");

    const runtime = readSource('src/components/settings/maplibreRuntime.ts');
    expect(runtime).toContain("import * as maplibre from 'maplibre-gl'");
    expect(runtime).toContain("import 'maplibre-gl/dist/maplibre-gl-worker.mjs'");
    expect(runtime).toContain('maplibre.setWorkerUrl(import.meta.url)');
  });

  it('joins map locations through personEntityId without account or name heuristics', () => {
    const mainBoard = readSource('src/components/dashboard/MainBoard.tsx');
    const houseMembers = readSource('src/services/houseMembers.ts');
    const contextSidebar = readSource('src/components/settings/ContextSidebar.tsx');

    expect(mainBoard).toContain('buildHouseMemberPresences({');
    expect(mainBoard).toContain('members: householdPeople');
    expect(contextSidebar).toContain('membersPresence.map((point) => (');
    expect(mainBoard).not.toContain('personMetaByUserId');
    expect(mainBoard).not.toContain('personMetaByName');
    expect(houseMembers).toContain('const entity = states[personEntityId]');
  });
});
