import React from 'react';
import { lookNameOf, useEditorWords } from '../../i18n/editorTranslations';
import { GlassChoiceRows } from '../ui/GlassListRow';
import { GlassSegmented } from '../ui/GlassSegmented';
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
  /** In a row that scrolls, all in view at once; a list by default. */
  layout?: 'list' | 'row';
  /** The name of a look, when it is not one of the related controls: those of a device. */
  nameOf?: (look: T) => string;
  /** The real control in a look, in its compact form and in its large one. */
  preview?: (look: T, form: 'compact' | 'hero') => React.ReactNode;
};

/* The looks that fit, the recommended one marked, and the real control in the chosen one. */
export function LookPicker<T extends string>({ looks, recommended, value, onChange, label, preview, nameOf = lookNameOf, layout = 'list' }: LookPickerProps<T>) {
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
      {layout === 'row' ? (
        <GlassSegmented<T>
          ariaLabel={label}
          scrollable
          minOptionWidth="max-content"
          options={offered.map((look) => ({ value: look, label: nameOf(look), ariaLabel: look === recommended ? `${nameOf(look)}, ${words('recommended')}` : nameOf(look) }))}
          value={value}
          onChange={onChange}
          renderOption={(option) => (
            <span className="editor-look-option">
              {option.label}
              {option.value === recommended ? <small>{words('recommended')}</small> : null}
            </span>
          )}
        />
      ) : (
        <GlassChoiceRows<T>
          ariaLabel={label}
          options={offered.map((look) => ({ value: look, label: nameOf(look), note: look === recommended ? words('recommended') : undefined }))}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export default LookPicker;
