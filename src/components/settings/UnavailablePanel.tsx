import { useI18n } from '../../i18n/I18nProvider';
import { PanelFrame } from '../devices/panels/shell/PanelFrame';
import { PanelStates } from '../devices/panels/shell/PanelStates';

/* A card whose entity the Home cannot read: it says so, with nothing to press. */
export function UnavailablePanel({ name, inSheet, onClose }: { name: string; inSheet: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <PanelFrame
      name={name}
      status={null}
      live={{ off: true, notice: <PanelStates state={{ kind: 'unavailable' }} /> }}
      closeLabel={inSheet ? t('builder.closeDevice') : undefined}
      onClose={onClose}
    >
      {null}
    </PanelFrame>
  );
}

export default UnavailablePanel;
