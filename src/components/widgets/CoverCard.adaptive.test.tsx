import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { COVER_FEATURE_CLOSE, COVER_FEATURE_OPEN, COVER_FEATURE_SET_POSITION, COVER_FEATURE_SET_TILT_POSITION } from '../../utils/coverUtils';
import { CoverCard } from './CoverCard';

const widget: Widget = {
  id: 'cover-adaptive-test', kind: 'cover', title: 'Garage', entityId: 'cover.garage',
  status: 'closed', isOn: false, layout: { i: 'cover-adaptive-test', x: 0, y: 0, w: 2, h: 3 },
};

const renderCard = (features: number, state = 'open') => renderToStaticMarkup(
  <CoverCard
    widget={widget}
    liveEntity={{ state, supportedFeatures: features, rawAttributes: { device_class: 'garage', current_cover_position: 40 } }}
    isSelected={false} isEditMode={false} onClick={() => undefined}
    onPositionChange={() => undefined} onTiltPositionChange={() => undefined}
    onOpenCover={() => undefined} onStopCover={() => undefined} onCloseCover={() => undefined}
  />,
);

describe('Cover card adaptive capabilities', () => {
  it('keeps supported position controls mounted without a visual variant', () => {
    const markup = renderCard(COVER_FEATURE_SET_POSITION);
    expect(markup).toContain('cover-card__cover-slider');
    expect(markup).not.toContain('cover-card__tilt-segments');
    expect(markup).not.toContain('cover-card__quick-actions');
    expect(markup).not.toContain('data-cover-variant');
  });

  it('mounts tilt alongside position and only the supported quick actions', () => {
    const markup = renderCard(COVER_FEATURE_SET_POSITION | COVER_FEATURE_SET_TILT_POSITION | COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE);
    expect(markup).toContain('cover-card__cover-slider');
    expect(markup).toContain('cover-card__tilt-segments');
    expect(markup).toContain('cover-card__quick-actions');
    expect(markup).not.toContain('cover-card__quick-action--stop');
  });

  it('keeps open/close available without inventing position or stop controls', () => {
    const markup = renderCard(COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE);
    expect(markup).not.toContain('cover-card__cover-slider');
    expect(markup).not.toContain('cover-card__tilt-segments');
    expect(markup).toContain('cover-card__quick-actions');
    expect(markup).not.toContain('cover-card__quick-action--stop');
  });

  it('leaves supported controls visible but disabled when unavailable', () => {
    const markup = renderCard(COVER_FEATURE_SET_POSITION | COVER_FEATURE_OPEN, 'unavailable');
    expect(markup).toContain('data-cover-available="false"');
    expect(markup).toContain('cover-card__cover-slider');
    expect(markup).toContain('disabled');
  });
});
