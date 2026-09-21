import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BinarySensorControls } from './BinarySensorControls';

describe('BinarySensorControls', () => {
  it('shows a read-only binary state without numeric history or unsupported battery data', () => {
    const markup = renderToStaticMarkup(
      <BinarySensorControls name="Sensore fumo" rawState="on" deviceClass="smoke" />,
    );

    expect(markup).toContain('Fumo rilevato');
    expect(markup).not.toContain('recharts');
    expect(markup).not.toContain('N/D');
    expect(markup).not.toContain('Batteria');
  });
});
