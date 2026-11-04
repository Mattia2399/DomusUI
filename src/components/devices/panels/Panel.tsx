import React from 'react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { LazyLoadErrorBoundary } from '../../common/LazyLoadBoundary';
import { PanelView } from './PanelView';
import { loadedPanelEntry, loadPanelEntry, panelSkeletonOf, type PanelEntry, type PanelKind } from './registry';
import { PanelControlZone } from './shell/PanelControlZone';
import { PanelFooter } from './shell/PanelFooter';
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

const drawnBy = (entry: PanelEntry<unknown>) =>
  function PanelOfKind({ input, live, closeLabel, onClose }: EntryProps) {
    return <PanelView spec={entry.useSpec(input)} live={live} closeLabel={closeLabel} onClose={onClose} />;
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
      header={<PanelHeader icon={null} name={name} status={status ?? ' '} closeLabel={closeLabel ?? dt('close')} onClose={onClose} />}
      hero={
        <PanelHero>
          <div className="panel-hero-main" aria-busy="true">
            <span className={`panel-hero-empty is-${panelSkeletonOf(kind)}`} />
          </div>
        </PanelHero>
      }
      controls={<PanelControlZone ariaLabel={dt('panelAdjust')} />}
      groups={<PanelGroups groups={[]} />}
      footer={<PanelFooter />}
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
