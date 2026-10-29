// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { FirstRunGuide, type FirstRunGuideVariant } from './FirstRunGuide';

afterEach(cleanup);
beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));

function renderGuide(variant: FirstRunGuideVariant, onFinish = vi.fn(), onConnect = vi.fn()) {
  render(<I18nProvider><FirstRunGuide variant={variant} onFinish={onFinish} onConnect={onConnect} /></I18nProvider>);
  return { onFinish, onConnect };
}

describe('the first-run guide of the Home', () => {
  it('walks three steps and starts on the last', async () => {
    const { onFinish } = renderGuide('recommended');
    expect(await screen.findByRole('dialog', { name: 'La tua Home è pronta' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.getByRole('dialog', { name: 'Personalizzala in Modifica' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.getByRole('dialog', { name: 'Stanze e scene' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Passo 3 di 3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Inizia' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('can be skipped, from the keyboard too', async () => {
    const { onFinish } = renderGuide('empty');
    expect(await screen.findByRole('dialog', { name: 'Si parte da zero' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salta' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it('explains the controls of the first device opened, at the top of a phone', async () => {
    const { onFinish } = renderGuide('controls');
    const dialog = await screen.findByRole('dialog', { name: 'I comandi del dispositivo' });
    expect(dialog.className).toContain('is-top');
    expect(screen.getByText('Comandi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.getByRole('dialog', { name: 'Passa a un altro' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.getByRole('dialog', { name: 'Torna alla Home' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Collega la tua casa' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('in the Demo, ends by offering to connect the real home', async () => {
    const { onConnect } = renderGuide('demo');
    expect(await screen.findByRole('dialog', { name: 'Questa è la casa Demo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Collega la tua casa' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collega la tua casa' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
