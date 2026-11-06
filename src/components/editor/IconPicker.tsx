import React from 'react';
import clsx from 'clsx';
import { useEditorWords } from '../../i18n/editorTranslations';
import { EDITOR_ICONS } from './editorIcons';
import './editor.css';

export type IconPickerProps = {
  /** The key of the icon; none means the one the device brings. */
  value?: string;
  onChange: (icon: string | undefined) => void;
  label: string;
};

/* The icons to choose from, and Automatica to go back to that of the device. */
export function IconPicker({ value, onChange, label }: IconPickerProps) {
  const words = useEditorWords();
  return (
    <div role="radiogroup" aria-label={label} className="editor-icons">
      <button type="button" role="radio" aria-checked={!value} className={clsx(!value && 'is-on')} onClick={() => onChange(undefined)}>
        {words('iconAuto')}
      </button>
      {Object.entries(EDITOR_ICONS).map(([key, { icon: Icon, name }]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} aria-label={name} title={name} className={clsx(value === key && 'is-on')} onClick={() => onChange(key)}>
          <Icon size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default IconPicker;
