import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Widget } from '../../types/dashboardModels';
import { COVER_FEATURE_CLOSE, COVER_FEATURE_OPEN, COVER_FEATURE_SET_POSITION, COVER_FEATURE_SET_TILT_POSITION } from '../../utils/coverUtils';
import { CoverCard } from './CoverCard';

const widget: Widget = {
  id: 'cover-adaptive-test', kind: 'cover', title: 'Garage', entityId: 'cover.garage',
  status: 'closed', isOn: false, layout: { i: 'cover-adaptive-test', x: 0, y: 0, w: 2, h: 3 },
};

const renderCard = (features: number, state = 'open', displayVariant: 'mini' | 'compact' | 'standard' | 'full' = 'standard') => renderToStaticMarkup(
  <CoverCard
    widget={widget}
    liveEntity={{ state, supportedFeatures: features, rawAttributes: { device_class: 'garage', current_cover_position: 40 } }}
    isSelected={false} isEditMode={false} onClick={() => undefined}
    displayVariant={displayVariant}
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
    expect(markup).toContain('data-cover-display-variant="standard"');
  });

  it('keeps Mini visually essential even when controls exist in the DOM', () => {
    const markup = renderCard(COVER_FEATURE_SET_POSITION | COVER_FEATURE_SET_TILT_POSITION, 'open', 'mini');
    expect(markup).toContain('data-cover-display-variant="mini"');
    expect(markup).toContain('cover-card__cover-slider');
    expect(markup).toContain('cover-card__tilt-segments');
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

  it('uses the layout-derived Standard strip and keeps container queries for progressive disclosure', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/components/widgets/CoverCard.css'), 'utf8');

    expect(css).toContain('.cover-card__subtitle,');
    expect(css).toContain('.cover-card__mode-button,');
    expect(css).toContain('.cover-card__controls { display: none; }');
    expect(css).toContain(".cover-card[data-cover-display-variant='mini'] {");
    expect(css).toContain('--cover-card-radius: 1.2rem;');
    expect(css).toContain(".cover-card[data-cover-display-variant='mini'] .cover-card__surface");
    expect(css).toContain('border-radius: 1.2rem;');
    expect(css).toContain(".cover-card[data-cover-display-variant='mini'][data-cover-breakpoint='xl'] .cover-card__subtitle");
    expect(css).toContain(".cover-card[data-cover-display-variant='standard'] .cover-card__surface");
    expect(css).toContain(".cover-card[data-cover-display-variant='standard'][data-cover-control-mode='position'] .cover-card__cover-slider");
    expect(css).toContain(".cover-card[data-cover-display-variant='standard'][data-cover-control-mode='tilt'] .cover-card__tilt-segments");
    expect(css).toContain('@container cover-card (min-width: 170px) and (min-height: 148px)');
    expect(css).toContain(".cover-card:not([data-cover-display-variant='standard'])[data-cover-control-mode='position'] .cover-card__cover-slider { display: block; }");
    expect(css).toContain(".cover-card:not([data-cover-display-variant='standard'])[data-cover-control-mode='tilt'] .cover-card__tilt-segments { display: grid; }");
    expect(css).toContain('@container cover-card (min-width: 300px) and (min-height: 235px)');
    expect(css).toContain('@container cover-card (min-width: 170px) and (min-height: 176px)');
    expect(css).toContain('@container cover-card (min-width: 176px) and (min-height: 250px) and (max-width: 299px)');
    expect(css).toContain(".cover-card:not([data-cover-display-variant='standard']) .cover-card__quick-actions { display: flex; }");
    expect(css).not.toContain('data-cover-variant');
  });
});
