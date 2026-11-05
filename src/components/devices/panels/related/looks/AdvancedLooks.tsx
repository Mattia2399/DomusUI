import React from 'react';
import { GlassCountdown } from '../../../../ui/families/controlsAdvanced';
import type { RelatedLookProps } from '../relatedLookTypes';

/** Seconds from the h:mm:ss a timer of Home Assistant writes. */
export function secondsOf(value: unknown) {
  if (typeof value !== 'string') return 0;
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/* The time left on a timer. */
export default function AdvancedLooks({ look, model, form, acts, words }: RelatedLookProps) {
  if (look !== 'countdown') return null;
  const finishes = typeof model.attributes.finishes_at === 'string' ? Date.parse(model.attributes.finishes_at) : Number.NaN;
  const active = model.state === 'active' && Number.isFinite(finishes);
  return (
    <GlassCountdown
      finishesAt={active ? finishes : undefined}
      remaining={active ? undefined : secondsOf(model.attributes.remaining)}
      total={secondsOf(model.attributes.duration)}
      label={model.name}
      note={model.state === 'paused' ? words('paused') : undefined}
      onToggle={model.state === 'active' || model.state === 'paused' ? acts.toggleTimer : undefined}
      size={form}
    />
  );
}
