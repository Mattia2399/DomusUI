import React from 'react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { LazyLoadErrorBoundary } from '../../common/LazyLoadBoundary';
import { PanelView, type PanelViewProps } from './PanelView';
import { RelatedContext, type RelatedContextValue, type RelatedSource } from './related/relatedContext';
import { PanelStates } from './shell/PanelStates';
import { loadedPanelEntry, loadPanelEntry, panelSkeletonOf, type PanelEntry, type PanelKind } from './registry';
import { PanelGroups } from './shell/PanelGroups';
import { PanelHeader } from './shell/PanelHeader';
import { PanelHero } from './shell/PanelHero';
import { PanelShell, type PanelLive } from './shell/PanelShell';

/* A panel of any device: the entry of its kind, drawn by PanelView. It loads when it opens. */

type PanelProps = {
  kind: PanelKind;
  input: unknown;
  live?: PanelLive;
  closeLabel?: string;
  onClose: () => void;
};

type EntryProps = Omit<PanelProps, 'kind'>;

const views = new Map<PanelKind, React.ComponentType<EntryProps>>();

type RelatedPanelProps = PanelViewProps & { source: RelatedSource; context: RelatedContextValue; onRetry: () => void };

/* What the related controls are made of arrives only for a card that has them. If it cannot arrive, the device still answers. */
const lazyRelatedPanel = () =>
  React.lazy<React.ComponentType<RelatedPanelProps>>(() =>
    import('./related/RelatedPanelView').catch(() => ({
      default: ({ source: _source, context: _context, onRetry, live, ...panel }: RelatedPanelProps) => <PanelView {...panel} live={{ ...live, notice: <PanelStates state={{ kind: 'unavailable', onRetry }} /> }} />,
    })),
  );
let RelatedPanel = lazyRelatedPanel();

const drawnBy = (entry: PanelEntry<unknown>) =>
  function PanelOfKind({ input, live, closeLabel, onClose }: EntryProps) {
    const spec = entry.useSpec(input);
    const context = React.useContext(RelatedContext);
    const [, redraw] = React.useReducer((count: number) => count + 1, 0);
    const source = context?.sourceOf(spec.owner);
    const panel = { spec, live, closeLabel, onClose };
    if (!context || !source || !(source.relatedControls?.length || source.widgets?.length)) return <PanelView {...panel} />;
    return (
      <RelatedPanel
        {...panel}
        source={source}
        context={context}
        onRetry={() => {
          RelatedPanel = lazyRelatedPanel();
          redraw();
        }}
      />
    );
  };

function viewOf(kind: PanelKind) {
  let view = views.get(kind);
  if (!view) {
    const entry = loadedPanelEntry(kind);
    // Code that has arrived draws at once: a lazy would wait 300 ms behind its fallback.
    view = entry
      ? drawnBy(entry)
      : React.lazy(async () => {
          try {
            return { default: drawnBy(await loadPanelEntry(kind)) };
          } catch (error) {
            // The next time it opens, it tries again.
            views.delete(kind);
            throw error;
          }
        });
    views.set(kind, view);
  }
  return view;
}

/*
 * The panel at once, in its places, with the protagonist empty: nothing moves when the
 * entry arrives. A sheet has its height, so the finger that opened it with a long press
 * is lifted over the sheet, not over the backdrop that would close it.
 */
function PanelSkeleton({ kind, input, status, closeLabel, onClose }: PanelProps & { status?: string }) {
  const dt = useDevicesTranslations();
  const name = (input as { model?: { name?: string } }).model?.name ?? '';
  return (
    <PanelShell
      header={<PanelHeader name={name} status={status ?? ' '} closeLabel={closeLabel ?? dt('close')} onClose={onClose} />}
      hero={
        <PanelHero className={`is-${panelSkeletonOf(kind)}`}>
          <span className={`panel-hero-empty is-${panelSkeletonOf(kind)}`} aria-busy="true" />
        </PanelHero>
      }
      groups={<PanelGroups groups={[]} />}
    />
  );
}

export function Panel(props: PanelProps) {
  const { kind, input, live, closeLabel, onClose } = props;
  const dt = useDevicesTranslations();
  const View = viewOf(kind);
  return (
    <LazyLoadErrorBoundary failure={<PanelSkeleton {...props} status={dt('unavailable')} />}>
      <React.Suspense fallback={<PanelSkeleton {...props} />}>
        <View input={input} live={live} closeLabel={closeLabel} onClose={onClose} />
      </React.Suspense>
    </LazyLoadErrorBoundary>
  );
}

export default Panel;
