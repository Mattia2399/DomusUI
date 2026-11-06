import React from 'react';
import { lookNameOf, useEditorWords } from '../../i18n/editorTranslations';
import { GlassChoiceRows } from '../ui/GlassListRow';
import './editor.css';

/** The looks that need several entities: the picker never offers them. */
export const MULTI_ENTITY_LOOKS: ReadonlySet<string> = new Set(['curve', 'time-range', 'multi-chart', 'button-group', 'checkbox']);

export type LookPickerProps<T extends string> = {
  /** The looks this control can take, the recommended one among them. */
  looks: readonly T[];
  recommended?: T;
  value: T;
  onChange: (look: T) => void;
  label: string;
  /** The real control in a look, in its compact form and in its large one. */
  preview?: (look: T, form: 'compact' | 'hero') => React.ReactNode;
};

/* The looks that fit, the recommended one marked, and the real control in the chosen one. */
export function LookPicker<T extends string>({ looks, recommended, value, onChange, label, preview }: LookPickerProps<T>) {
  const words = useEditorWords();
  const offered = looks.filter((look) => !MULTI_ENTITY_LOOKS.has(look));
  return (
    <div className="editor-looks">
      {preview ? (
        <div className="editor-look-previews">
          <figure>
            <figcaption>{words('formCompact')}</figcaption>
            <div>{preview(value, 'compact')}</div>
          </figure>
          <figure className="is-hero">
            <figcaption>{words('formHero')}</figcaption>
            <div>{preview(value, 'hero')}</div>
          </figure>
        </div>
      ) : null}
      <GlassChoiceRows<T>
        ariaLabel={label}
        options={offered.map((look) => ({ value: look, label: lookNameOf(look), note: look === recommended ? words('recommended') : undefined }))}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

export default LookPicker;
