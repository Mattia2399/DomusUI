import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIONS_WORKSPACE_AVAILABLE,
  AutomationsBuilder,
} from './AutomationsBuilder';

describe('AutomationsBuilder release availability', () => {
  it('keeps the unfinished workspace behind a clear non-interactive preview', () => {
    render(<AutomationsBuilder />);

    expect(AUTOMATIONS_WORKSPACE_AVAILABLE).toBe(false);
    expect(screen.getByRole('heading', { name: 'Automazioni' })).toBeTruthy();
    expect(screen.getByText('Prossimamente')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Questa pagina sta evolvendo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuova Automazione' })).toBeNull();
  });
});
