// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('widget configuration contract', () => {
  it('derives card authority from the entity instead of exposing a source selector', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/RightSidebarManager.tsx'),
      'utf8',
    );

    expect(source).toContain('resolveCardDataSource');
    expect(source).not.toContain('Sorgente dati card');
    expect(source).not.toContain('Mock locale');
    expect(source).not.toContain("GlassSegmentSelect<'ha' | 'mock'>");
  });

  it('separates greeting title information from weather configuration', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/RightSidebarManager.tsx'),
      'utf8',
    );

    expect(source).toContain("GlassSegmentSelect<'title' | 'weather'>");
    expect(source).toContain("label: bt('Titolo e info')");
    expect(source).toContain("label: 'Meteo'");
    expect(source).toContain("greetingConfigTab === 'title'");
    expect(source).toContain("label={bt('Mostra il meteo nella card saluto')}");
    expect(source).toContain('checked={Boolean(showWeather)}');
  });
});
