import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassText.css';

export type GlassTextAreaProps = GlassControlState & {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  size?: GlassControlSize;
  className?: string;
};

/* Text on several lines, up to 5 before it scrolls. It saves on leaving the field and never goes past its limit. */
export function GlassTextArea({ label, value, onCommit, maxLength = 255, placeholder, size = 'group', className, disabled, pending, error }: GlassTextAreaProps) {
  const state = { disabled, pending, error };
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className={clsx('glass-textarea', `is-${size}`, controlStateClass(state), className)}>
      <textarea
        aria-label={label}
        aria-invalid={error || undefined}
        rows={size === 'compact' ? 2 : 3}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={controlBlocked(state)}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text);
        }}
      />
      <p>
        {text.length}/{maxLength}
      </p>
    </div>
  );
}

export default GlassTextArea;
