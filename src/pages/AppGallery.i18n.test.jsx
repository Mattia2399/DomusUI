import React from 'react';
import { cleanup, render as renderUi, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../i18n/I18nProvider';
import { AppGallery } from './AppGallery';
import { AccessControlProvider } from '../security/AccessControlProvider';
import { accessFor } from '../test/accessFixtures';

// Every render as an administrator would see it; Access Control is tested on its own.
function AdminAccess({ children }) {
  return <AccessControlProvider access={accessFor('admin')}>{children}</AccessControlProvider>;
}
const render = (ui, options) =>
  renderUi(ui, { wrapper: AdminAccess, ...options });


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
    expect(screen.getByRole('heading', { name: 'App Gallery' })).toBeTruthy();
    expect(screen.getByText('Systems')).toBeTruthy();
    expect(screen.getByText('Smart Irrigation')).toBeTruthy();
  });

  it('renders the irrigation workspace in French', () => {
    renderGallery('fr', '/appgallery/irrigation');
    expect(screen.getAllByRole('button', { name: 'Vue d’ensemble' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Système arrêté').length).toBeGreaterThan(0);
    expect(screen.getByText('Système d’irrigation')).toBeTruthy();
  });
});
