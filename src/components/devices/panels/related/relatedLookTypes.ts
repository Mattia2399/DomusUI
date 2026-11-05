import type { GlassControlSize } from '../../../ui/glassControl';
import type { RelatedLook } from '../../../../types/relatedControl';
import type { RelatedWords } from '../../../../i18n/relatedTranslations';
import type { RelatedModel } from './relatedModel';

/** What a look can ask of its entity, already tied to it. */
export type RelatedActs = {
  setOn: (on: boolean) => void;
  press: () => void;
  /** Pressed and let go, for what stays on while held. */
  hold: (pressed: boolean) => void;
  setNumber: (value: number) => void;
  setOption: (option: string) => void;
  setText: (text: string) => void;
  setDateTime: (date: string | null, time: string | null) => void;
  /** Goes to the page, if it is one inside the app. */
  go: () => void;
  /** Pauses or resumes a timer. */
  toggleTimer: () => void;
};

export type RelatedLookProps = {
  look: RelatedLook;
  model: RelatedModel;
  form: GlassControlSize;
  acts: RelatedActs;
  /** Sends the value while it moves, or when it is let go. */
  commit: 'live' | 'release';
  /** The values in time, the oldest first. */
  history: readonly number[];
  locale: string;
  words: RelatedWords;
};
