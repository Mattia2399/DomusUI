import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { GlassTextInput, type GlassTextInputProps } from './GlassTextInput';

export type GlassPasswordInputProps = Omit<GlassTextInputProps, 'type' | 'trailing'> & {
  showLabel: string;
  hideLabel: string;
};

/* A covered field, with the eye to show it. The value never reaches the state of a card. */
export function GlassPasswordInput({ showLabel, hideLabel, ...props }: GlassPasswordInputProps) {
  const [shown, setShown] = React.useState(false);
  return (
    <GlassTextInput
      {...props}
      type={shown ? 'text' : 'password'}
      trailing={
        <button type="button" aria-label={shown ? hideLabel : showLabel} aria-pressed={shown} disabled={props.disabled} onPointerDown={(event) => event.preventDefault()} onClick={() => setShown(!shown)}>
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      }
    />
  );
}

export default GlassPasswordInput;
