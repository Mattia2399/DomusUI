import { describe, expect, it } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import {
  buildCoverCardModel,
  normalizeCoverDeviceClass,
  translateCoverDeviceClass,
} from './coverCardModel';
import {
  COVER_DEVICE_CLASS_MOCK_ENTITY_IDS,
  COVER_MAX_COMPAT_FEATURES,
  COVER_MAX_COMPAT_MOCK_ENTITY_ID,
  COVER_MOCK_STATES,
  createCoverMock,
  createCoverStateMocks,
} from './coverMock';

const widget: Widget = {
  id: COVER_MAX_COMPAT_MOCK_ENTITY_ID,
  kind: 'cover',
  title: 'Cover Max Compat',
  entityId: COVER_MAX_COMPAT_MOCK_ENTITY_ID,
  status: 'open',
  isOn: true,
  value: 70,
  unit: '%',
  coverTiltPosition: 45,
  layout: { i: COVER_MAX_COMPAT_MOCK_ENTITY_ID, x: 0, y: 0, w: 2, h: 3 },
};

describe('buildCoverCardModel', () => {
  it('reads official cover position, tilt, device class and capabilities', () => {
    const model = buildCoverCardModel({
      widget,
      liveEntity: {
        state: 'opening',
        supportedFeatures: COVER_MAX_COMPAT_FEATURES,
        rawAttributes: {
          friendly_name: 'Garage demo',
          device_class: 'garage',
          current_cover_position: 42,
          current_cover_tilt_position: 25,
          supported_features: COVER_MAX_COMPAT_FEATURES,
        },
      },
    });

    expect(model.state).toBe('opening');
    expect(model.stateLabel).toBe('Apertura…');
    expect(model.position).toBe(42);
    expect(model.coverage).toBe(58);
    expect(model.tiltDegrees).toBe(23);
    expect(model.deviceClass).toBe('garage');
    expect(model.deviceClassLabel).toBe('Garage');
    expect(model.supportsOpen).toBe(true);
    expect(model.supportsClose).toBe(true);
    expect(model.supportsSetPosition).toBe(true);
    expect(model.supportsStop).toBe(true);
    expect(model.supportsOpenTilt).toBe(true);
    expect(model.supportsCloseTilt).toBe(true);
    expect(model.supportsSetTiltPosition).toBe(true);
    expect(model.supportsStopTilt).toBe(true);
  });

  it('keeps unavailable covers offline and hides tilt when it is not exposed', () => {
    const model = buildCoverCardModel({
      widget,
      liveEntity: {
        state: 'unavailable',
        rawAttributes: {
          friendly_name: 'Tapparella offline',
          device_class: 'shutter',
          supported_features: 0,
        },
      },
    });

    expect(model.state).toBe('unavailable');
    expect(model.tone).toBe('offline');
    expect(model.isAvailable).toBe(false);
    expect(model.hasTilt).toBe(false);
    expect(model.compactStateLabel).toBe('Non disponibile');
  });
});

describe('cover device class helpers', () => {
  it('normalizes official and inferred device classes', () => {
    expect(normalizeCoverDeviceClass('blind')).toBe('blind');
    expect(normalizeCoverDeviceClass(undefined, 'Tenda da sole patio')).toBe('awning');
    expect(normalizeCoverDeviceClass(undefined, 'Tenda oscurante camera')).toBe('shade');
    expect(normalizeCoverDeviceClass(undefined, 'Cancello ingresso')).toBe('gate');
    expect(translateCoverDeviceClass('window')).toBe('Finestra');
  });
});

describe('cover mock', () => {
  it('creates one complete cover fixture for every supported state', () => {
    const mocks = createCoverStateMocks();
    const expectedStateEntityIds = COVER_MOCK_STATES.map((state) =>
      state === 'open' ? COVER_MAX_COMPAT_MOCK_ENTITY_ID : `cover.max_compat_${state}`,
    );

    expect(Object.keys(mocks)).toEqual(expect.arrayContaining(expectedStateEntityIds));
    expectedStateEntityIds.forEach((entityId) => {
      expect(mocks[entityId].supportedFeatures).toBe(COVER_MAX_COMPAT_FEATURES);
      expect(mocks[entityId].rawAttributes?.demo_supported_states).toEqual(COVER_MOCK_STATES);
    });
  });

  it('creates preview fixtures for each cover device class style', () => {
    const mocks = createCoverStateMocks();

    expect(Object.keys(mocks)).toEqual(expect.arrayContaining([...COVER_DEVICE_CLASS_MOCK_ENTITY_IDS]));
    expect(mocks['cover.living_room_shutter'].rawAttributes?.device_class).toBe('shutter');
    expect(mocks['cover.kitchen_blind'].rawAttributes?.device_class).toBe('blind');
    expect(mocks['cover.bedroom_curtain'].rawAttributes?.device_class).toBe('curtain');
    expect(mocks['cover.patio_awning'].rawAttributes?.device_class).toBe('awning');
    expect(mocks['cover.bedroom_shade'].rawAttributes?.device_class).toBe('shade');
    expect(mocks['cover.air_damper'].rawAttributes?.device_class).toBe('damper');
    expect(mocks['cover.front_door'].rawAttributes?.device_class).toBe('door');
    expect(mocks['cover.garage_door'].rawAttributes?.device_class).toBe('garage');
    expect(mocks['cover.driveway_gate'].rawAttributes?.device_class).toBe('gate');
    expect(mocks['cover.office_window'].rawAttributes?.device_class).toBe('window');
  });

  it('exercises the stopped demo state through the card model', () => {
    const model = buildCoverCardModel({
      widget,
      liveEntity: createCoverMock('stopped'),
    });

    expect(model.state).toBe('stopped');
    expect(model.position).toBe(52);
    expect(model.hasTilt).toBe(true);
  });
});
