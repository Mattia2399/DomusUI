import React from 'react';
import { clsx } from 'clsx';
import type { GlassControlSize } from '../../../ui/glassControl';
import type { RelatedControl } from '../../../../types/relatedControl';
import type { RelatedWords } from '../../../../i18n/relatedTranslations';
import { PanelStates } from '../shell/PanelStates';
import { RELATED_LOOKS } from './relatedControlRegistry';
import { familyOfLook, RELATED_FAMILY_LOADERS } from './relatedLooks';
import type { RelatedActs, RelatedLookProps } from './relatedLookTypes';
import type { RelatedModel } from './relatedModel';
import './related.css';

export type RelatedControlViewProps = {
  control: RelatedControl;
  model: RelatedModel;
  form: GlassControlSize;
  acts: RelatedActs;
  history: readonly number[];
  locale: string;
  words: RelatedWords;
};

/* The piece of code of a family: nothing, then the piece, or the failure to try again. */
function useFamily(look: RelatedControl['look']) {
  const family = familyOfLook(look);
  const [state, setState] = React.useState<{ family: string; Looks: React.ComponentType<RelatedLookProps> | null; failed: boolean }>({ family, Looks: null, failed: false });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    RELATED_FAMILY_LOADERS[family]().then(
      (module) => {
        if (alive) setState({ family, Looks: module.default, failed: false });
      },
      () => {
        if (alive) setState({ family, Looks: null, failed: true });
      },
    );
    return () => {
      alive = false;
    };
  }, [family, attempt]);
  const current = state.family === family ? state : { family, Looks: null, failed: false };
  return { Looks: current.Looks, failed: current.failed, retry: () => setAttempt((count) => count + 1) };
}

/*
 * One related control in the form asked for. It is the only thing that ties an entity of
 * Home Assistant to the library: an entity that is gone says so and does not vanish.
 */
export function RelatedControlView({ control, model, form, acts, history, locale, words }: RelatedControlViewProps) {
  const { Looks, failed, retry } = useFamily(control.look);
  const minHeight = form === 'group' ? RELATED_LOOKS[control.look].groupHeight : undefined;
  const classes = clsx('related-look', `is-${form}`);
  const style = minHeight ? { minHeight } : undefined;
  const standsAlone = control.look === 'page';
  if (!model.available && !standsAlone) {
    return (
      <div className={clsx(classes, 'is-unavailable')} data-testid="related-unavailable">
        <PanelStates state={{ kind: 'message', text: words('unavailable') }} />
      </div>
    );
  }
  if (failed) {
    return (
      <div className={classes} style={style} data-testid="related-failed">
        <PanelStates state={{ kind: 'unavailable', onRetry: retry }} />
      </div>
    );
  }
  if (!Looks) return <div className={clsx(classes, 'is-waiting')} style={style} aria-busy="true" data-testid="related-placeholder" />;
  const commit = control.look === 'bar' || control.look === 'bar-value' ? control.options?.commit ?? 'release' : 'release';
  return (
    <div className={classes} style={style}>
      <Looks look={control.look} model={model} form={form} acts={acts} commit={commit} history={history} locale={locale} words={words} />
    </div>
  );
}

export default RelatedControlView;
