import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import type { AccessSnapshot } from '../../security/accessControl';
import { accessFor } from '../../test/accessFixtures';
import { WidgetCardRenderer } from '../widgets/CardRenderer';
import { createHomeAlarmMock } from '../widgets/alarmMock';
import type { Widget } from '../../types/dashboardModels';
import { AccessLockedBanner, AccessNotice } from './AccessScreens';

const TECHNICAL = /403|ACL|RBAC|capabilit|permission_denied|access\.|\.view|\.manage/i;

function renderWith(ui: React.ReactElement, access: AccessSnapshot = accessFor('admin')) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  return render(
    <I18nProvider>
      <AccessControlProvider access={access}>{ui}</AccessControlProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('AccessNotice', () => {
  it('says a page is not available, with a heading and a way home, and nothing technical', () => {
    const onGoHome = vi.fn();
    const { container } = renderWith(<AccessNotice kind="denied" onGoHome={onGoHome} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Non disponibile per il tuo account' });
    expect(heading.closest('section')?.getAttribute('aria-labelledby')).toBe(heading.id);
    fireEvent.click(screen.getByRole('button', { name: 'Vai alla Home' }));
    expect(onGoHome).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    expect(container.textContent).not.toMatch(TECHNICAL);
  });

  it.each([
    ['error', 'Autorizzazioni non disponibili'],
    ['unavailable', 'Domus non è pronta'],
  ] as const)('tells a %s apart and offers to try again', (kind, title) => {
    const onRetry = vi.fn();
    const { container } = renderWith(<AccessNotice kind={kind} onRetry={onRetry} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(onRetry).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(TECHNICAL);
  });

  it('speaks the language of the interface', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    render(
      <I18nProvider>
        <AccessNotice kind="denied" />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Non disponible pour votre compte' })).toBeTruthy();
  });
});

describe('AccessLockedBanner', () => {
  it('tells a member and an administrator what is going on, and can be dismissed', () => {
    const onDismiss = vi.fn();
    const view = renderWith(<AccessLockedBanner isAdministrator={false} onDismiss={onDismiss} />);
    expect(screen.getByRole('status').textContent).toContain('Le autorizzazioni Domus richiedono attenzione');
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onDismiss).toHaveBeenCalled();
    view.unmount();
    renderWith(<AccessLockedBanner isAdministrator onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Un amministratore di Home Assistant può ripristinarle');
  });
});

describe('Home cards and security.view', () => {
  const alarm: Widget = {
    id: 'alarm.home',
    kind: 'alarm',
    title: 'Allarme Casa',
    entityId: 'alarm_control_panel.home_alarm',
    status: 'disarmed',
    isOn: false,
    layout: { i: 'alarm.home', x: 0, y: 0, w: 2, h: 2 },
  } as Widget;

  const card = (
    <WidgetCardRenderer
      widget={alarm}
      dashboardState={{} as never}
      isEditMode={false}
      isInteractive
      isSelected={false}
      onClick={vi.fn()}
      liveEntity={createHomeAlarmMock()}
    />
  );

  it('shows nothing of the alarm to an account without security.view', () => {
    const { container } = renderWith(card, accessFor('restricted'));
    expect(container.querySelector('[data-access-restricted-card]')).not.toBeNull();
    expect(container.textContent).not.toContain('Allarme Casa');
    expect(container.textContent).not.toContain('Disinserito');
  });

  it('shows the alarm to an account with security.view', () => {
    const { container } = renderWith(card, accessFor('member'));
    expect(container.querySelector('[data-access-restricted-card]')).toBeNull();
    expect(container.textContent).toContain('Allarme Casa');
  });
});
