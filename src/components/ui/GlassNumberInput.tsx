import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassNumberProblem = 'not-a-number' | 'too-low' | 'too-high' | 'off-step';

type Limits = { min?: number; max?: number; step?: number };

/** What was written, as a number the entity accepts, or what is wrong with it. A comma works as a point. */
export function checkNumber(text: string, { min, max, step }: Limits): { value: number } | { problem: GlassNumberProblem } {
  const value = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(value)) return { problem: 'not-a-number' };
  if (min !== undefined && value < min) return { problem: 'too-low' };
  if (max !== undefined && value > max) return { problem: 'too-high' };
  if (step) {
    const steps = (value - (min ?? 0)) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return { problem: 'off-step' };
  }
  return { value };
}

export type GlassNumberInputProps = GlassControlState & Limits & {
  label: string;
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  unit?: string;
  /** Under the field while all is well: "Da 1,5 a 10 kW". */
  hint?: React.ReactNode;
  /** Says what is wrong, in the words of whoever uses it. */
  describeProblem: (problem: GlassNumberProblem) => string;
  size?: GlassControlSize;
  className?: string;
};

/* A field to write a number in. Enter or leaving it confirms; a wrong number is explained and never sent. */
export function GlassNumberInput({ label, value, onValueChange, min, max, step, unit, hint, describeProblem, size = 'group', className, disabled, pending, error }: GlassNumberInputProps) {
  const state = { disabled, pending, error };
  const id = React.useId();
  const shown = value === null || value === undefined ? '' : String(value);
  const [text, setText] = React.useState(shown);
  const [problem, setProblem] = React.useState<GlassNumberProblem | null>(null);
  React.useEffect(() => {
    setText(shown);
    setProblem(null);
  }, [shown]);
  const confirm = () => {
    if (text === shown) return;
    const checked = checkNumber(text, { min, max, step });
    if ('problem' in checked) {
      setProblem(checked.problem);
      return;
    }
    setProblem(null);
    onValueChange(checked.value);
  };
  return (
    <div className={clsx('glass-number', `is-${size}`, problem && 'has-problem', controlStateClass(state), className)}>
      <div className="glass-number-field">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={Boolean(problem || error) || undefined}
          aria-describedby={`${id}-note`}
          disabled={controlBlocked(state)}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onBlur={confirm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') confirm();
          }}
        />
        {unit ? <span aria-hidden="true">{unit}</span> : null}
      </div>
      <p id={`${id}-note`} role={problem ? 'alert' : undefined}>
        {problem ? describeProblem(problem) : hint}
      </p>
    </div>
  );
}

export default GlassNumberInput;
