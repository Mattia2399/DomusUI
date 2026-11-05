import React from 'react';
import { useI18n } from '../../../../i18n/I18nProvider';
import type { PanelSpec } from '../registry';
import { PanelView, type PanelViewProps } from '../PanelView';
import type { RelatedContextValue, RelatedSource } from './relatedContext';
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
