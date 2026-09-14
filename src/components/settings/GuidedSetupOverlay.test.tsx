import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutDashboard, PencilRuler } from 'lucide-react';
import { GuidedSetupOverlay, resolveCoachmarkPlacement } from './GuidedSetupOverlay';

const steps = [
  {
    title: 'Scopri la Home',
    description: 'Osserva i controlli principali.',
    icon: LayoutDashboard,
  },
  {
    title: 'Personalizza',
    description: 'Apri la modalità Edit.',
    hint: 'Le modifiche vengono salvate automaticamente.',
    icon: PencilRuler,
  },
];

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-tour-target="edit-mode"]').forEach((element) => element.remove());
  document.body.style.overflow = '';
});

describe('GuidedSetupOverlay', () => {
  it('places a tall coachmark beside a bottom-left target without covering it', () => {
    const placement = resolveCoachmarkPlacement({
      target: {
        element: document.createElement('button'),
        top: 840,
        left: 36,
        width: 48,
        height: 48,
        borderRadius: '24px',
      },
      viewportWidth: 1920,
      viewportHeight: 1032,
      coachmark: { width: 370, height: 390 },
    });

    expect(placement.side).toBe('right');
    expect(placement.left).toBeGreaterThanOrEqual(102);
    expect(placement.top + 390).toBeLessThanOrEqual(1016);
  });

  it('uses the shared accessible modal and navigates through the guide', () => {
    const onDismiss = vi.fn();
    render(
      <GuidedSetupOverlay
        isOpen
        tag="Primo accesso"
        heading="La tua Home è pronta"
        steps={steps}
        onDismiss={onDismiss}
        completeLabel="Esplora"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'La tua Home è pronta' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Scopri la Home' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continua' }));
    expect(screen.getByRole('heading', { name: 'Personalizza' })).toBeTruthy();
    expect(screen.getByText('Le modifiche vengono salvate automaticamente.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByRole('heading', { name: 'Scopri la Home' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continua' }));
    fireEvent.click(screen.getByRole('button', { name: 'Esplora' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps skip and navigation actions in the shared bottom footer', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <GuidedSetupOverlay
        isOpen
        tag="Guida"
        heading="Configurazione"
        steps={steps}
        onDismiss={onDismiss}
        skipLabel="Chiudi guida"
      />,
    );

    const footer = container.querySelector('.guided-setup-footer');
    const skipButton = screen.getByRole('button', { name: 'Chiudi guida' });
    expect(footer?.contains(skipButton)).toBe(true);
    fireEvent.click(skipButton);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('distinguishes completing the guide from skipping it', () => {
    const onDismiss = vi.fn();
    const onComplete = vi.fn();
    render(
      <GuidedSetupOverlay
        isOpen
        tag="Guida"
        heading="Configurazione"
        steps={[steps[0]]}
        onDismiss={onDismiss}
        onComplete={onComplete}
        completeLabel="Fine"
        skipLabel="Salta"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fine' }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('anchors a dynamic step to the visible breakpoint target and uses the real control', async () => {
    const onDismiss = vi.fn();
    const targetClick = vi.fn();
    const target = document.createElement('button');
    target.type = 'button';
    target.dataset.tourTarget = 'edit-mode';
    target.textContent = 'Edit';
    target.addEventListener('click', targetClick);
    target.getBoundingClientRect = () => ({
      top: 120,
      left: 24,
      right: 72,
      bottom: 168,
      width: 48,
      height: 48,
      x: 24,
      y: 120,
      toJSON: () => ({}),
    });
    document.body.appendChild(target);

    render(
      <GuidedSetupOverlay
        isOpen
        tag="Primo accesso"
        heading="Configura"
        steps={[{
          id: 'edit-mode',
          title: 'Personalizza',
          description: 'Usa il comando reale.',
          target: '[data-tour-target="edit-mode"]',
          actionLabel: 'Attiva Edit Mode',
          advanceOnTargetClick: true,
        }]}
        onDismiss={onDismiss}
      />,
    );

    const coachmark = await screen.findByRole('dialog', { name: 'Configura: Personalizza' });
    expect(coachmark.closest('.onboarding-neutral-scope')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Attiva Edit Mode' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Attiva Edit Mode' }));

    await waitFor(() => expect(targetClick).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    target.remove();
  });
});
