import React from 'react';
import { useI18n } from '../../../../i18n/I18nProvider';
import type { PanelSpec } from '../registry';
import { PanelView, type PanelViewProps } from '../PanelView';
import type { MockEntityStateMap } from '../../../../types/ha';
import type { RelatedControl } from '../../../../types/relatedControl';
import { relatedWordsOf } from '../../../../i18n/relatedTranslations';
import type { RelatedContextValue, RelatedSource } from './relatedContext';
import { RelatedControlView } from './RelatedControlView';
import type { RelatedActs } from './relatedLookTypes';
import { relatedModelOf } from './relatedModel';
import { relatedPanelControls } from './relatedPanelControls';

export type RelatedPanelViewProps = Omit<PanelViewProps, 'related' | 'spec'> & {
  spec: PanelSpec;
  source: RelatedSource;
  context: RelatedContextValue;
};

/*
 * The panel of a card with related controls. All of this arrives only for such a card:
 * until then the panel shows the same skeleton it opens with, so the row never jumps.
 */
export default function RelatedPanelView({ source, context, ...panel }: RelatedPanelViewProps) {
  const { locale } = useI18n();
  const [, refresh] = React.useReducer((count: number) => count + 1, 0);
  return <PanelView {...panel} related={relatedPanelControls(source, context, locale, refresh)} />;
}

const nothing = () => undefined;
const NO_ACTS: RelatedActs = { setOn: nothing, press: nothing, hold: nothing, setNumber: nothing, setOption: nothing, setText: nothing, setDateTime: nothing, go: nothing, toggleTimer: nothing };

/** A related control as its group draws it, with its commands going nowhere: what the edit mode shows. */
export function RelatedControlPreview({ control, states }: { control: RelatedControl; states: MockEntityStateMap }) {
  const { locale } = useI18n();
  const model = relatedModelOf(control.entityId, states[control.entityId], control.name);
  return <RelatedControlView control={control} model={model} form="group" acts={NO_ACTS} history={[]} locale={locale} words={relatedWordsOf(locale)} />;
}
