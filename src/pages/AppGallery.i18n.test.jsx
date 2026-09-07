import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../i18n/I18nProvider';
import { AppGallery } from './AppGallery';

function renderGallery(locale, route) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  window.history.replaceState({}, '', route);
  return render(
    <I18nProvider>
      <AppGallery suppressBrowserNavigation navigationRoute={route} runtimeMode="demo" />
    </I18nProvider>,
  );
}

describe('App Gallery localization', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it('renders the launcher in English', () => {
    renderGallery('en', '/appgallery');
    expect(screen.getByRole('heading', { name: 'App Library' })).toBeTruthy();
    expect(screen.getByText('Dedicated apps and workspaces')).toBeTruthy();
    expect(screen.getByText('Smart Irrigation')).toBeTruthy();
  });

  it('renders the irrigation workspace in French', () => {
    renderGallery('fr', '/appgallery/irrigation');
    expect(screen.getAllByRole('button', { name: 'Vue d’ensemble' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Système arrêté').length).toBeGreaterThan(0);
    expect(screen.getByText('Système d’irrigation')).toBeTruthy();
  });
});
