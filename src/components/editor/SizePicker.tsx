import React from 'react';
import clsx from 'clsx';
import { useEditorWords } from '../../i18n/editorTranslations';
import './editor.css';

export type SizeOption = {
  id: string;
  /** "Mini", "Standard", "Espansa": the words of the card. */
  label: string;
  w: number;
  h: number;
  available?: boolean;
};

export type SizePickerProps = {
  options: readonly SizeOption[];
  /** The one in use; none when the card has an older size, shown as it is. */
  value: string | null;
  onChange: (option: SizeOption) => void;
  label: string;
  current?: { w: number; h: number } | null;
};

/** The drawing of a size, in its proportions. */
const drawing = (w: number, h: number) => ({ width: Math.min(72, 16 * w + 4 * (w - 1)), height: Math.min(64, 12 * h + 3 * (h - 1)) });

/* The sizes of a card, each with its drawing, applied as soon as one is touched. */
export function SizePicker({ options, value, onChange, label, current }: SizePickerProps) {
  const words = useEditorWords();
  const old = value === null && current ? current : null;
  return (
    <div role="radiogroup" aria-label={label} className={clsx('editor-sizes', old && 'has-current')}>
      {old ? (
        <button type="button" role="radio" aria-checked className="is-on">
          <i aria-hidden="true" style={drawing(old.w, old.h)} />
          {words('sizeCurrent', { size: `${old.w}×${old.h}` })}
        </button>
      ) : null}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          aria-label={`${option.label}, ${option.w}×${option.h}`}
          disabled={option.available === false}
          className={clsx(value === option.id && 'is-on')}
          onClick={() => onChange(option)}
        >
          <i aria-hidden="true" style={drawing(option.w, option.h)} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default SizePicker;
