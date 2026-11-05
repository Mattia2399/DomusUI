import React from 'react';
import { GlassHoldButton, GlassMomentaryButton, GlassResultButton, GlassRunButton, GlassStatusPill } from '../../../../ui/families/controlsActions';
import type { RelatedLookProps } from '../relatedLookTypes';

/* Actions of their own piece. */
export default function ActionsLooks({ look, model, form, acts, words }: RelatedLookProps) {
  const small = form === 'compact' ? 'compact' : 'group';
  switch (look) {
    case 'momentary':
      return <GlassMomentaryButton ariaLabel={`${model.name}: ${words('kindHold')}`} label={words('kindHold')} note={words('holdNote')} onPress={acts.hold} size={form} />;
    case 'hold':
      return <GlassHoldButton ariaLabel={model.name} label={words('start')} note={words('confirmNote')} onConfirm={acts.press} size={form} />;
    case 'running':
      return <GlassRunButton label={form === 'group' ? words('start') : model.name} runningLabel={words('running')} running={model.on} onPress={acts.press} size={small} />;
    case 'result':
      return (
        <GlassResultButton
          label={form === 'group' ? words('start') : model.name}
          successLabel={words('done')}
          size={small}
          onPress={() => {
            acts.press();
            return Promise.resolve(true as const);
          }}
        />
      );
    case 'pill':
      return <GlassStatusPill label={form === 'group' ? words('activate') : model.name} active={model.on} onPress={acts.press} />;
    default:
      return null;
  }
}
