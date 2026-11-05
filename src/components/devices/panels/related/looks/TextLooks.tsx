import React from 'react';
import { GlassDatePicker, GlassDateTimePicker, GlassKeypad, GlassPasswordInput, GlassTextArea, GlassTextInput, GlassTimePicker } from '../../../../ui/families/controlsText';
import type { RelatedLookProps } from '../relatedLookTypes';

const stringOf = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);

/** The date and the time of an entity, in whichever way it says them. */
export function dateAndTimeOf({ state, attributes, domain }: Pick<RelatedLookProps['model'], 'state' | 'attributes' | 'domain'>) {
  const [first, second] = state.split(/[T ]/);
  if (domain === 'time') return { date: null, time: first?.slice(0, 5) ?? null };
  const looksLikeDate = /^\d{4}-\d{2}-\d{2}$/.test(first ?? '');
  const date = looksLikeDate ? first : null;
  const time = looksLikeDate ? second?.slice(0, 5) ?? null : /^\d{1,2}:\d{2}/.test(first ?? '') ? first.slice(0, 5) : null;
  const hour = stringOf(attributes.hour);
  const minute = stringOf(attributes.minute);
  return { date, time: time ?? (hour !== undefined && minute !== undefined ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : null) };
}

/* Text and dates of their own piece. */
export default function TextLooks({ look, model, form, acts, locale, words }: RelatedLookProps) {
  const limits = { minLength: typeof model.attributes.min === 'number' ? model.attributes.min : undefined, maxLength: typeof model.attributes.max === 'number' ? model.attributes.max : undefined, pattern: stringOf(model.attributes.pattern) };
  const describeProblem = (problem: 'too-short' | 'too-long' | 'pattern') => words(problem === 'too-short' ? 'tooShort' : problem === 'too-long' ? 'tooLong' : 'badPattern');
  const { date, time } = dateAndTimeOf(model);
  const dateWords = { previousLabel: words('previousMonth'), nextLabel: words('nextMonth'), locale };
  const timeWords = { hoursLabel: words('hours'), minutesLabel: words('minutes'), moreLabel: words('more'), lessLabel: words('less') };
  switch (look) {
    case 'text':
      return <GlassTextInput label={model.name} value={model.state} clearLabel={words('clear')} describeProblem={describeProblem} onCommit={acts.setText} size={form} {...limits} />;
    case 'password':
      return <GlassPasswordInput label={model.name} value={model.state} clearLabel={words('clear')} showLabel={words('show')} hideLabel={words('hide')} describeProblem={describeProblem} onCommit={acts.setText} size={form} {...limits} />;
    case 'textarea':
      return <GlassTextArea label={model.name} value={model.state} maxLength={limits.maxLength} onCommit={acts.setText} size={form} />;
    case 'keypad':
      return <GlassKeypad label={model.name} value={model.number !== null ? String(model.number) : ''} unit={model.unit} deleteLabel={words('remove')} confirmLabel={words('confirm')} onSubmit={(typed) => acts.setNumber(Number(typed))} size={form} />;
    case 'date':
      return <GlassDatePicker label={model.name} value={date} onChange={(next) => acts.setDateTime(next, null)} size={form} {...dateWords} />;
    case 'time':
      return <GlassTimePicker label={model.name} value={time} onChange={(next) => acts.setDateTime(null, next)} size={form} {...timeWords} />;
    case 'datetime':
      return <GlassDateTimePicker label={model.name} dateLabel={words('date')} timeLabel={words('time')} date={date} time={time} dateText={date ?? '–'} onChange={acts.setDateTime} size={form} {...dateWords} {...timeWords} />;
    default:
      return null;
  }
}
