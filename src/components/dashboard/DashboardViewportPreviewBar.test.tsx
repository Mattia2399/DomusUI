import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardViewportPreviewBar } from './DashboardViewportPreviewBar';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => { cleanup(); window.localStorage.removeItem(LANGUAGE_STORAGE_KEY); });

describe('DashboardViewportPreviewBar', () => {
  it('changes the active preview mode through one responsive control', () => {
    const onPreviewModeChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <DashboardViewportPreviewBar
        previewMode="auto"
        canvasBreakpoint="xl"
        onPreviewModeChange={onPreviewModeChange}
        availableModes={['auto', 'tablet', 'compact', 'mobile']}
        primaryAction={<button type="button">Catalogo</button>}
        desktopActions={<button type="button">Annulla</button>}
      />,
      { wrapper: I18nProvider },
    );

    fireEvent.click(getByRole('radio', { name: 'Anteprima mobile' }));

    expect(onPreviewModeChange).toHaveBeenCalledWith('mobile');
    expect(queryByRole('radio', { name: 'Anteprima desktop' })).toBeNull();
    expect(getByRole('radio', { name: 'Anteprima tablet verticale' })).toBeTruthy();
    expect(getByRole('button', { name: 'Catalogo' })).toBeTruthy();
    expect(getByRole('button', { name: 'Annulla' })).toBeTruthy();
    expect(getByRole('toolbar', { name: 'Anteprima responsive della dashboard' })).toBeTruthy();
  });
});
