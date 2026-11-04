import React from 'react';
import clsx from 'clsx';
import { GlassButton } from './GlassButton';
import type { GlassControlState } from './glassControl';
import './glassConfirm.css';

export type GlassConfirmProps = GlassControlState & {
  /** What the button says before asking: "Spegni". */
  label: React.ReactNode;
  /** What it says when asking: "Spegni la presa". */
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  /** The question above the two choices, in a box. Without it the two choices take the place of the button. */
  question?: React.ReactNode;
  /** Always asking: something else opened the question, as the power of a protected plug. */
  asking?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  className?: string;
};

/* The first touch asks in the same place, with Cancel and the action in red. A second touch does it. */
export function GlassConfirm({ label, confirmLabel, cancelLabel, question, asking: alwaysAsking, icon, onConfirm, onCancel, className, disabled, pending, error }: GlassConfirmProps) {
  const [askingNow, setAsking] = React.useState(false);
  const asking = alwaysAsking ?? askingNow;
  const cancelButton = React.useRef<HTMLButtonElement>(null);
  const startButton = React.useRef<HTMLButtonElement>(null);
  const backToStart = React.useRef(false);

  React.useEffect(() => {
    if (asking) cancelButton.current?.focus();
    else if (backToStart.current) {
      backToStart.current = false;
      startButton.current?.focus();
    }
  }, [asking]);

  const cancel = () => {
    backToStart.current = true;
    setAsking(false);
    onCancel?.();
  };

  if (!asking) {
    return (
      <GlassButton
        ref={startButton}
        variant="soft"
        size="lg"
        className={clsx('glass-confirm-start', className)}
        disabled={disabled}
        pending={pending}
        error={error}
        onClick={() => setAsking(true)}
      >
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {label}
      </GlassButton>
    );
  }

  return (
    <div
      role="group"
      aria-label={typeof question === 'string' ? question : undefined}
      className={clsx('glass-confirm', question ? 'is-box' : null, className)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        cancel();
      }}
    >
      {question ? <p className="glass-confirm-question">{question}</p> : null}
      <div className="glass-confirm-choices">
        <GlassButton ref={cancelButton} variant="soft" size="lg" onClick={cancel}>
          {cancelLabel}
        </GlassButton>
        <GlassButton
          variant="destructive"
          size="lg"
          onClick={() => {
            backToStart.current = true;
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </GlassButton>
      </div>
    </div>
  );
}

export default GlassConfirm;
