import React from 'react';
import { GlassAreaChart, GlassBarChart, GlassLineChart, GlassSparkline, GlassStats } from '../../../../ui/families/controlsCharts';
import type { RelatedLookProps } from '../relatedLookTypes';
import { formatRelatedNumber, formatRelatedValue } from '../relatedModel';

/* Charts of their own piece: only real history, or they say there is none. */
export default function ChartsLooks({ look, model, form, history, locale, words }: RelatedLookProps) {
  const value = formatRelatedValue(model, locale);
  const shared = { label: model.name, emptyLabel: words('noData'), size: form };
  switch (look) {
    case 'sparkline':
      return <GlassSparkline points={history} value={value} {...shared} />;
    case 'chart-line':
      return <GlassLineChart points={history} value={value} {...shared} />;
    case 'chart-area':
      return <GlassAreaChart points={history} value={value} {...shared} />;
    case 'chart-bar':
      return <GlassBarChart bars={history} current={history.length - 1} value={value} {...shared} />;
    case 'chart-stats': {
      const round = (entry: number) => (history.length > 0 ? formatRelatedNumber(entry, locale, 1) : '–');
      return (
        <GlassStats
          size={form}
          items={[
            { label: words('minimum'), value: round(Math.min(...history)) },
            { label: words('maximum'), value: round(Math.max(...history)) },
            { label: words('average'), value: round(history.reduce((sum, entry) => sum + entry, 0) / (history.length || 1)) },
          ]}
        />
      );
    }
    default:
      return null;
  }
}
