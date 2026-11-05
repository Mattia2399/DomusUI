import React from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassText.css';

export type GlassTextProblem = 'too-short' | 'too-long' | 'pattern';

type TextLimits = { minLength?: number; maxLength?: number; pattern?: string };

/** What is wrong with a text for its entity, or nothing. A pattern that does not compile is left alone. */
export function checkText(text: string, { minLength, maxLength, pattern }: TextLimits): GlassTextProblem | null {
  if (minLength !== undefined && text.length < minLength) return 'too-short';
  if (maxLength !== undefined && text.length > maxLength) return 'too-long';
  if (pattern) {
    try {
      if (!new RegExp(`^(?:${pattern})$`).test(text)) return 'pattern';
    } catch {
      return null;
    }
  }
  return null;
}

export type GlassTextInputProps = GlassControlState & TextLimits & {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  clearLabel: string;
  placeholder?: string;
  describeProblem: (problem: GlassTextProblem) => string;
  /** Covers what is written; the way to show it belongs to GlassPasswordInput. */
  type?: 'text' | 'password';
  trailing?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* A field of one line, with its count and the way to empty it. Enter saves; a wrong text is explained and not sent. */
export function GlassTextInput({ label, value, onCommit, clearLabel, placeholder, describeProblem, type = 'text', trailing, minLength, maxLength, pattern, size = 'group', className, disabled, pending, error }: GlassTextInputProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const id = React.useId();
  const [text, setText] = React.useState(value);
  const [problem, setProblem] = React.useState<GlassTextProblem | null>(null);
  React.useEffect(() => {
    setText(value);
    setProblem(null);
  }, [value]);
  const save = () => {
    if (text === value) return;
    const wrong = checkText(text, { minLength, maxLength, pattern });
    setProblem(wrong);
    if (!wrong) onCommit(text);
  };
  return (
    <div className={clsx('glass-text', `is-${size}`, problem && 'has-problem', controlStateClass(state), className)}>
      <div className="glass-text-field">
        <input
          type={type}
          aria-label={label}
          aria-invalid={Boolean(problem || error) || undefined}
          aria-describedby={`${id}-note`}
          placeholder={placeholder}
          disabled={blocked}
          value={text}
          autoComplete={type === 'password' ? 'off' : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        {text && !blocked ? (
          <button type="button" aria-label={clearLabel} onPointerDown={(event) => event.preventDefault()} onClick={() => setText('')}>
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        ) : null}
        {trailing}
      </div>
      <p id={`${id}-note`} role={problem ? 'alert' : undefined}>
        <span>{problem ? describeProblem(problem) : null}</span>
        {maxLength !== undefined ? <span>{text.length}/{maxLength}</span> : null}
      </p>
    </div>
  );
}

export default GlassTextInput;
