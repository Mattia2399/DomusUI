import { ClimatePanel } from '../devices/panels/ClimatePanel';
import { DevicePanel } from '../devices/panels/DevicePanel';
import { LightPanel } from '../devices/panels/LightPanel';
import { resolveDeviceKind } from '../devices/model/entityKind';
import {
  deviceModelOf,
  homeClimateToModel,
  lampToLightModel,
  runClimateAction,
  runDeviceAction,
  runLightAction,
} from './homePanelModels';
import { homePanelOf, type HomePanelProps } from './homePanelRoute';

/* The shared panel a card of the Home opens, in place of its old content. */

export function HomePanel(props: HomePanelProps) {
  const { activeDevice, lamp, climate, actions, embedded, onClose } = props;
  const panel = homePanelOf(props);

  if (panel === 'light') {
    const model = lampToLightModel(activeDevice.id, activeDevice.name, lamp);
    return <LightPanel model={model} embedded={embedded} onAction={(action) => runLightAction(action, model, actions)} onClose={onClose} />;
  }
  if (panel === 'climate') {
    const model = homeClimateToModel(activeDevice.id, activeDevice.name, climate);
    return (
      <ClimatePanel
        model={model}
        roomTemperature={model.current}
        roomHumidity={typeof climate.currentHumidity === 'number' ? climate.currentHumidity : null}
        embedded={embedded}
        onAction={(action) => runClimateAction(action, model, actions)}
        onClose={onClose}
      />
    );
  }
  if (panel === 'device') {
    const model = deviceModelOf(props);
    if (!model) return null;
    const kind = resolveDeviceKind(model.entityId);
    return (
      <DevicePanel
        model={model}
        protectedPlug={false}
        embedded={embedded}
        onAction={(action) => runDeviceAction(action, kind, actions)}
        onClose={onClose}
      />
    );
  }
  return null;
}

export default HomePanel;
