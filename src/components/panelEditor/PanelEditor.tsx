import React from 'react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { GlassButton } from '../ui/GlassButton';
import { GlassSegmented } from '../ui/GlassSegmented';
import { AppearanceTab } from './AppearanceTab';
import { ControlsTab } from './ControlsTab';
import { controlRows, entityNameOf, FIXED_PANEL_KINDS, relatedLooksOf } from './controlsModel';
import { useDeviceControls } from './deviceControls';
import { DeviceTab } from './DeviceTab';
import { usePanelKit } from './panelKit';
import type { PanelEditorProps } from './panelEditorTypes';
import { usePanelHouseContext } from '../devices/panels/panelData';
import { usePanelServices } from '../devices/panels/panelServicesContext';
import './panelEditor.css';

export type PanelEditorTab = 'appearance' | 'device' | 'controls';

/*
 * The edit mode of a card: Aspetto, Dispositivo, Controlli. One column, in the place where the
 * panels open: the right column on a tablet or a desktop, the sheet on a phone. Its head has
 * the name of the card and Fine. It arrives only in edit mode.
 */
export default function PanelEditor(props: PanelEditorProps) {
  const services = usePanelServices();
  const house = usePanelHouseContext();
  const houseContext = services ? house : undefined;
  const words = usePanelEditorWords();
  const [tab, setTab] = React.useState<PanelEditorTab>('appearance');
  // The control open in Controlli, chosen in the list.
  const [control, setControl] = React.useState<string | null>(null);
  React.useEffect(() => {
    setTab('appearance');
    setControl(null);
  }, [props.widget.id]);
  const fixed = FIXED_PANEL_KINDS.has(props.widget.kind);
  const nameOf = React.useCallback((id: string) => words(`ctl_${id}` as 'ctl_info'), [words]);
  // The code of the panels arrives with Controlli, from the piece the Home already loads.
  const kit = usePanelKit(tab === 'controls' && !fixed);
  const device = useDeviceControls(kit, props.widget, props.haStates, nameOf);
  const rows = kit ? controlRows(kit, props.widget, device.controls.layout, device.controls.controls, relatedLooksOf(props.haStates), entityNameOf(props.haStates)) : [];

  return (
    <div className={`panel-editor ${props.compact ? 'is-sheet' : 'is-column'}`} data-testid="panel-editor">
      <header className="panel-editor-head">
        <span>
          <span>{words('edit')}</span>
          <h3>{props.widget.title}</h3>
        </span>
        <GlassButton variant="filled" onClick={props.onDone}>
          {words('done')}
        </GlassButton>
      </header>
      <GlassSegmented<PanelEditorTab>
        ariaLabel={words('tabs')}
        options={[
          { value: 'appearance', label: words('tabAppearance') },
          { value: 'device', label: words('tabDevice') },
          { value: 'controls', label: words('tabControls') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="panel-editor-scroll">
        {tab === 'appearance' ? (
          <AppearanceTab {...props} showPreview />
        ) : tab === 'device' ? (
          <DeviceTab {...props} houseContext={houseContext} />
        ) : (
          <ControlsTab {...props} houseContext={houseContext} kit={kit} rows={rows} ready={device.controls.ready} fixed={fixed} selected={control} onSelect={setControl} />
        )}
      </div>
      {tab === 'controls' && !fixed ? device.reader : null}
    </div>
  );
}
