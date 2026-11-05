import React from 'react';
import { CircleDot } from 'lucide-react';
import {
  barsOfSignal,
  GlassBattery,
  GlassConnection,
  GlassGauge,
  GlassHumidity,
  GlassIconStatus,
  GlassLed,
  GlassLevel,
  GlassMiniRing,
  GlassProgressBar,
  GlassRadialGauge,
  GlassStatusBadge,
  GlassStatusGlow,
  GlassTemperature,
  GlassTrend,
  GlassValueDisplay,
  GlassValuePill,
} from '../../../../ui/families/controlsIndicators';
import type { RelatedLookProps } from '../relatedLookTypes';
import { formatRelatedNumber, formatRelatedValue } from '../relatedModel';

/** The scale of a temperature that says nothing of its own: water or a room. */
const scaleOf = (value: number) => (value > 40 ? { min: 30, max: 90 } : { min: 10, max: 35 });

/* Readings of their own piece. The name stands over them already: they say only the value. */
export default function IndicatorsLooks({ look, model, form, history, locale, words }: RelatedLookProps) {
  const number = model.number ?? 0;
  const percent = model.percent ?? 0;
  const text = model.number !== null ? formatRelatedValue(model, locale) : model.on ? words('on') : model.state === 'off' ? words('off') : model.state;
  const meaning = model.on ? ('ok' as const) : ('off' as const);
  const label = form === 'compact' ? model.name : undefined;

  switch (look) {
    case 'value':
      return model.number !== null ? <GlassValueDisplay value={formatRelatedNumber(number, locale)} unit={model.unit} size={form} /> : <GlassValueDisplay value={text} size={form} />;
    case 'value-pill':
      return <GlassValuePill label={label ?? ''} value={text} size={form} />;
    case 'badge':
      return <GlassStatusBadge label={text} meaning={meaning} size={form} />;
    case 'led':
      return <GlassLed label={text} meaning={meaning} size={form} />;
    case 'glow':
      return <GlassStatusGlow title={text} meaning={meaning} size={form} />;
    case 'gauge':
      return <GlassGauge percent={percent} value={`${Math.round(percent)}%`} label={model.name} size={form} />;
    case 'radial':
      return <GlassRadialGauge value={number} min={model.min ?? 0} max={model.max ?? Math.max(100, number * 1.5)} display={text} label={model.name} size={form} />;
    case 'mini-ring':
      return form === 'hero' ? <GlassGauge percent={percent} value={text} label={model.name} size="hero" /> : <GlassMiniRing percent={percent} label={label ?? ''} value={text} size={form} />;
    case 'progress':
      return <GlassProgressBar percent={percent} label={model.name} value={text} size={form} />;
    case 'progress-vertical':
      return <GlassProgressBar percent={percent} label={model.name} value={text} vertical size={form} />;
    case 'battery':
      return <GlassBattery percent={percent} size={form} />;
    case 'temperature': {
      const { min, max } = { ...scaleOf(number), ...(model.min !== undefined && model.max !== undefined ? { min: model.min, max: model.max } : {}) };
      return <GlassTemperature value={number} unit={model.unit} min={min} max={max} format={(value) => formatRelatedNumber(value, locale)} size={form} />;
    }
    case 'humidity':
      return <GlassHumidity percent={number} size={form} />;
    case 'level':
      return <GlassLevel percent={percent} ariaLabel={model.name} size={form} />;
    case 'connection':
      return <GlassConnection bars={model.number !== null ? barsOfSignal(number) : model.on ? 4 : 0} label={text} size={form} />;
    case 'trend': {
      const change = history.length >= 2 ? history[history.length - 1] - history[0] : 0;
      return <GlassTrend direction={change > 0 ? 'up' : change < 0 ? 'down' : 'flat'} label={`${change > 0 ? '+' : ''}${formatRelatedNumber(change, locale)}${model.unit ?? ''}`} size={form} />;
    }
    case 'icon-status':
      return <GlassIconStatus icon={<CircleDot size={form === 'hero' ? 56 : 22} />} title={text} meaning={meaning} size={form} />;
    default:
      return null;
  }
}
