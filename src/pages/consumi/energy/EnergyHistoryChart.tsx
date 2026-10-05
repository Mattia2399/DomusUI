import React from 'react';
import type { EnergyHistory, EnergyHistorySeriesId } from '../../../services/energyCoreClient';
import { bucketLabel, formatKwh } from './energyHistoryModel';

/*
 * Energy per bucket as 2px lines on one kWh axis. Colours follow the component (validated
 * for both themes in index.css); direction is encoded by dashes, so identity is never colour alone.
 */

const SERIES: Array<{ id: EnergyHistorySeriesId; label: string; color: string; dash?: string }> = [
  { id: 'production', label: 'Produzione fotovoltaica', color: 'var(--chart-solar)' },
  { id: 'consumption', label: 'Consumo della casa', color: 'var(--chart-home)' },
  { id: 'import', label: 'Prelievo dalla rete', color: 'var(--chart-grid)' },
  { id: 'export', label: 'Immissione in rete', color: 'var(--chart-grid)', dash: '5 4' },
  { id: 'battery_discharge', label: 'Scarica batteria', color: 'var(--chart-battery)' },
  { id: 'battery_charge', label: 'Carica batteria', color: 'var(--chart-battery)', dash: '5 4' },
];
const SHOWN_FIRST: EnergyHistorySeriesId[] = ['production', 'consumption', 'import'];
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function Swatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="16" height="6" aria-hidden="true" className="shrink-0">
      <path d="M1 3h14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash === undefined ? undefined : '4 3'} />
    </svg>
  );
}

/** A round step (1, 2, 2.5 or 5 times a power of ten) giving at most four gridlines above zero. */
function axisScale(max: number) {
  const raw = Math.max(max, 0.1) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? raw;
  const ticks = Math.max(1, Math.ceil(Math.max(max, 0.1) / step - 1e-9));
  return { step, ticks, top: step * ticks };
}

export function EnergyHistoryChart({ history }: { history: EnergyHistory }) {
  const available = SERIES.filter((series) => history.series[series.id]?.length);
  const [hidden, setHidden] = React.useState(() => new Set(available.filter((series) => !SHOWN_FIRST.includes(series.id)).map((series) => series.id)));
  const [active, setActive] = React.useState<number | null>(null);
  const [width, setWidth] = React.useState(640);
  const frameRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const visible = available.filter((series) => !hidden.has(series.id));
  const starts = (history.series[available[0]?.id] ?? []).map((point) => point.start);
  const count = starts.length;
  const values = visible.flatMap((series) => (history.series[series.id] ?? []).map((point) => point.value ?? 0));
  const { step, ticks, top } = axisScale(Math.max(0, ...values));
  const plotWidth = width - PAD.left - PAD.right;
  const x = (index: number) => PAD.left + (count > 1 ? (index * plotWidth) / (count - 1) : plotWidth / 2);
  const y = (value: number) => PAD.top + (1 - value / top) * (HEIGHT - PAD.top - PAD.bottom);
  // A bucket without data breaks the line instead of dropping it to zero.
  const path = (id: EnergyHistorySeriesId) =>
    (history.series[id] ?? []).reduce((acc, point, index, all) => {
      if (point.value === null) return acc;
      const move = index === 0 || all[index - 1].value === null ? 'M' : 'L';
      return `${acc}${move}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`;
    }, '');
  const every = history.bucket === 'hour' ? 6 : count > 10 ? 5 : 1;
  const unit = (value: number | null) => (value === null ? 'Nessun dato' : `${formatKwh(value)} kWh`);

  const pick = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(box.width, 1);
    setActive(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    setActive((current) => Math.max(0, Math.min(count - 1, (current ?? (delta > 0 ? -1 : count)) + delta)));
  };
  const toggle = (id: EnergyHistorySeriesId) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="energy-history-chart">
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Serie da mostrare">
        {available.map((series) => (
          <button
            key={series.id}
            type="button"
            aria-pressed={!hidden.has(series.id)}
            onClick={() => toggle(series.id)}
            className="flex min-h-8 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] px-2.5 text-[11px] font-semibold text-[color:var(--ui-text-secondary)] transition-opacity aria-[pressed=false]:opacity-45"
          >
            <Swatch color={series.color} dash={series.dash} />
            {series.label}
            {history.derived.includes(series.id) ? <span className="font-normal text-[color:var(--ui-text-tertiary)]">· derivato</span> : null}
          </button>
        ))}
      </div>
      <div ref={frameRef} className="relative mt-3">
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          tabIndex={0}
          aria-label={`Grafico dell’energia per ${history.bucket === 'hour' ? 'ora' : 'giorno'}. Usa le frecce per leggere i valori.`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]"
        >
          {Array.from({ length: ticks + 1 }, (_, tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick * step)} y2={y(tick * step)} stroke="var(--ui-separator)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(tick * step) + 3} textAnchor="end" fontSize="10" fill="var(--ui-text-tertiary)">
                {formatKwh(tick * step)}
              </text>
            </g>
          ))}
          {starts.map((start, index) => (index % every === 0 ? (
            <text key={start} x={x(index)} y={HEIGHT - 6} textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--ui-text-tertiary)">
              {bucketLabel(start, history.bucket)}
            </text>
          ) : null))}
          {active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--ui-text-tertiary)" strokeWidth="1" /> : null}
          {visible.map((series) => (
            <path key={series.id} d={path(series.id)} fill="none" stroke={series.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={series.dash} />
          ))}
          {active !== null
            ? visible.map((series) => {
                const value = history.series[series.id]?.[active]?.value;
                return value === null || value === undefined ? null : (
                  <circle key={series.id} cx={x(active)} cy={y(value)} r="4" fill={series.color} stroke="var(--ui-surface-primary)" strokeWidth="2" />
                );
              })
            : null}
          <rect
            x={PAD.left}
            y={0}
            width={plotWidth}
            height={HEIGHT - PAD.bottom}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[11rem] rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] px-3 py-2 shadow-[var(--ui-shadow-card)] backdrop-blur-md"
            style={x(active) > width / 2 ? { right: width - x(active) + 10 } : { left: x(active) + 10 }}
          >
            <p className="text-[11px] font-semibold capitalize text-[color:var(--ui-text-primary)]">{bucketLabel(starts[active], history.bucket, true)}</p>
            {visible.map((series) => (
              <p key={series.id} className="mt-1 flex items-center gap-1.5 text-[11px] text-[color:var(--ui-text-secondary)]">
                <Swatch color={series.color} dash={series.dash} />
                <span className="flex-1">{series.label}</span>
                <span className="font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{unit(history.series[series.id]?.[active]?.value ?? null)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>Energia per intervallo, in kWh</caption>
        <thead>
          <tr>
            <th scope="col">Intervallo</th>
            {available.map((series) => <th key={series.id} scope="col">{series.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {starts.map((start, index) => (
            <tr key={start}>
              <th scope="row">{bucketLabel(start, history.bucket, true)}</th>
              {available.map((series) => <td key={series.id}>{unit(history.series[series.id]?.[index]?.value ?? null)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
