import React from 'react';
import clsx from 'clsx';
import { useEditorWords } from '../../i18n/editorTranslations';
import './editor.css';

export type CardSize = 'mini' | 'standard' | 'expanded';

/** Mini U×2, Standard U×4, Espansa W×4: the drawing keeps their proportions. */
const PROPORTIONS: Record<CardSize, { width: number; height: number }> = {
  mini: { width: 34, height: 26 },
  standard: { width: 34, height: 52 },
  expanded: { width: 70, height: 52 },
};

export type SizePickerProps = {
  value: CardSize | null;
  onChange: (size: CardSize) => void;
  label: string;
  /** A card of an older size: it is shown as it is, until another is chosen. */
  current?: { w: number; h: number } | null;
  /** The sizes this card can take. */
  sizes?: readonly CardSize[];
};

/* Mini, Standard, Espansa, each with its drawing; applied as soon as it is touched. */
export function SizePicker({ value, onChange, label, current, sizes = ['mini', 'standard', 'expanded'] }: SizePickerProps) {
  const words = useEditorWords();
  const name: Record<CardSize, string> = { mini: words('sizeMini'), standard: words('sizeStandard'), expanded: words('sizeExpanded') };
  const old = value === null && current ? current : null;
  return (
    <div role="radiogroup" aria-label={label} className={clsx('editor-sizes', old && 'has-current')}>
      {old ? (
        <button type="button" role="radio" aria-checked className="is-on">
          <i aria-hidden="true" style={{ width: Math.min(70, 17 * old.w), height: Math.min(70, 13 * old.h) }} />
          {words('sizeCurrent', { size: `${old.w}×${old.h}` })}
        </button>
      ) : null}
      {sizes.map((size) => (
        <button key={size} type="button" role="radio" aria-checked={value === size} className={clsx(value === size && 'is-on')} onClick={() => onChange(size)}>
          <i aria-hidden="true" style={PROPORTIONS[size]} />
          {name[size]}
        </button>
      ))}
    </div>
  );
}

export default SizePicker;
