import React from 'react';
import { GlassHoldButton, GlassMomentaryButton, GlassResultButton, GlassRunButton, GlassStatusPill } from '../../../../ui/families/controlsActions';
import type { RelatedLookProps } from '../relatedLookTypes';

/* Actions of their own piece. */
export default function ActionsLooks({ look, model, form, acts, words }: RelatedLookProps) {
  const small = form === 'compact' ? 'compact' : 'group';
  switch (look) {
    case 'momentary':
      return <GlassMomentaryButton label={form === 'hero' ? model.name : words('kindHold')} note={words('holdNote')} onPress={acts.hold} size={form} />;
    case 'hold':
      return <GlassHoldButton label={form === 'hero' ? model.name : words('kindAction')} note={words('confirmNote')} onConfirm={acts.press} size={form} />;
    case 'running':
      return <GlassRunButton label={model.name} runningLabel={words('running')} running={model.on} onPress={acts.press} size={small} />;
    case 'result':
      return (
        <GlassResultButton
          label={model.name}
          successLabel={words('done')}
          size={small}
          onPress={() => {
            acts.press();
            return Promise.resolve(true as const);
          }}
        />
      );
    case 'pill':
      return <GlassStatusPill label={model.name} active={model.on} onPress={acts.press} />;
    default:
      return null;
  }
}
