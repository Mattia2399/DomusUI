import React from 'react';
import {
  GlassArrows,
  GlassLedRow,
  GlassLevels,
  GlassNumberInput,
  GlassRingSlider,
  GlassSelectMenu,
  GlassToggleCard,
} from '../../../../ui/families/controlsValues';
import type { RelatedLookProps } from '../relatedLookTypes';
import { formatRelatedNumber, formatRelatedValue } from '../relatedModel';

/* Choices, numbers and switches of their own piece. */
export default function ValuesLooks({ look, model, form, acts, commit, locale, words }: RelatedLookProps) {
  const options = model.options.map((option) => ({ value: option, label: option }));
  const min = model.min ?? 0;
  const max = model.max ?? 100;
  const step = model.step ?? 1;
  const number = model.number ?? min;
  const compactOnly = form === 'compact' ? 'compact' : 'group';
  const onOff = model.on ? words('on') : words('off');

  switch (look) {
    case 'menu':
      return <GlassSelectMenu ariaLabel={model.name} options={options} value={model.state} onChange={acts.setOption} size={form} />;
    case 'arrows': {
      // A number with few values walks through them too.
      const list = options.length > 0 ? options : Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => {
        const entry = String(min + index * step);
        return { value: entry, label: entry };
      });
      return <GlassArrows ariaLabel={model.name} previousLabel={words('previous')} nextLabel={words('next')} options={list} value={options.length > 0 ? model.state : String(number)} onChange={(next) => (options.length > 0 ? acts.setOption(next) : acts.setNumber(Number(next)))} size={form} />;
    }
    case 'number-input':
      return (
        <GlassNumberInput
          label={model.name}
          value={model.number}
          min={model.min}
          max={model.max}
          step={model.step}
          unit={model.unit}
          hint={model.min !== undefined && model.max !== undefined ? `${formatRelatedNumber(model.min, locale)} – ${formatRelatedNumber(model.max, locale)}` : undefined}
          describeProblem={(problem) =>
            problem === 'too-low'
              ? words('tooLow', { value: formatRelatedNumber(min, locale) })
              : problem === 'too-high'
                ? words('tooHigh', { value: formatRelatedNumber(max, locale) })
                : problem === 'off-step'
                  ? words('offStep', { value: formatRelatedNumber(step, locale) })
                  : words('notANumber')
          }
          size={form}
          onValueChange={acts.setNumber}
        />
      );
    case 'levels': {
      const levels = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => {
        const value = min + index * step;
        return { value, label: formatRelatedNumber(value, locale) };
      });
      return <GlassLevels ariaLabel={model.name} levels={levels} value={model.number} onChange={acts.setNumber} size={form} />;
    }
    case 'ring-slider':
      return <GlassRingSlider label={model.name} value={number} min={min} max={max} step={step} commit={commit} format={(next) => formatRelatedValue({ ...model, number: next }, locale)} size={form} onValueChange={acts.setNumber} />;
    case 'toggle-card':
      return <GlassToggleCard checked={model.on} onChange={acts.setOn} title={onOff} status={model.state} size={compactOnly} />;
    case 'led-row':
      return <GlassLedRow on={model.on} onChange={acts.setOn} title={onOff} size={compactOnly} />;
    default:
      return null;
  }
}
