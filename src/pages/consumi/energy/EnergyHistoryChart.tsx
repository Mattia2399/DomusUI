import React from 'react';
import type { EnergyHistoryResult, EnergyHistorySeriesName } from '../../../services/energyCoreClient';
import { BUCKET_LABEL, availableSeries, bucketLabels, formatKwh, readPoint } from './energyHistoryModel';

/*
 * Energy per bucket as 2px lines on one kWh axis, drawn from the `get_history`
 * document as it is. A bucket without a value breaks its line (the equivalent
 * of `connectNulls={false}`): it is never drawn as 0 and never bridged, while a
 * real 0 sits on the axis. Incomplete buckets are marked under the axis and the
 * bucket still in progress is shaded.
 */

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 30, left: 44 };
/** Visible from the start; the others stay in the legend, one tap away. */
const SHOWN_FIRST = 3;
/** Minimum room for one axis label, and the steps that keep the ticks regular. */
const TICK_ROOM: Record<EnergyHistoryResult['range']['bucket'], number> = { hour: 34, day: 40, week: 40, month: 58 };
const TICK_STEPS: Record<EnergyHistoryResult['range']['bucket'], number[]> = {
  hour: [1, 2, 3, 4, 6, 12],
  day: [1, 2, 3, 5, 7, 10, 15],
  week: [1, 2, 4, 8, 13, 26],
  month: [1, 2, 3, 4, 6, 12],
};

function Swatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="16" height="6" aria-hidden="true" className="shrink-0">
      <path d="M1 3h14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash === '1 4' ? '0.5 3.5' : dash === undefined ? undefined : '4 3'} />
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

/** Every how many buckets an axis label fits: fewer labels, never fewer points. */
export function tickEvery(bucket: EnergyHistoryResult['range']['bucket'], count: number, plotWidth: number) {
  const fit = Math.max(2, Math.floor(plotWidth / TICK_ROOM[bucket]));
  const needed = Math.ceil(count / fit);
  return TICK_STEPS[bucket].find((step) => step >= needed) ?? needed;
}

export function EnergyHistoryChart({ result }: { result: EnergyHistoryResult }) {
  const available = availableSeries(result);
  const [hidden, setHidden] = React.useState(() => new Set(available.slice(SHOWN_FIRST).map((series) => series.id)));
  const [active, setActive] = React.useState<number | null>(null);
  const [width, setWidth] = React.useState(640);
  const frameRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const labels = bucketLabels(result);
  const count = labels.length;
  const last = labels[count - 1]?.inProgress ? count - 1 : -1;
  const points = (id: EnergyHistorySeriesName) => result.series[id]?.points ?? [];
  const visible = available.filter((series) => !hidden.has(series.id));
  const values = visible.flatMap((series) => points(series.id).flatMap((point) => (point.value === null ? [] : [point.value])));
  const { step, ticks, top } = axisScale(Math.max(0, ...values));
  const plotWidth = width - PAD.left - PAD.right;
  const slot = plotWidth / Math.max(count, 1);
  // Each bucket is drawn in the middle of its slot, so the first and last never touch the edges.
  const x = (index: number) => PAD.left + slot * (index + 0.5);
  const y = (value: number) => PAD.top + (1 - value / top) * (HEIGHT - PAD.top - PAD.bottom);
  const base = HEIGHT - PAD.bottom;
  // A bucket without a value breaks the line: a new segment starts after it.
  const path = (id: EnergyHistorySeriesName) =>
    points(id).reduce((acc, point, index, all) => {
      if (point.value === null) return acc;
      const move = index === 0 || all[index - 1].value === null ? 'M' : 'L';
      return `${acc}${move}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`;
    }, '');
  // A value between two gaps has no segment: it is drawn as a dot.
  const lonely = (id: EnergyHistorySeriesName) =>
    points(id).flatMap((point, index, all) =>
      point.value !== null && (all[index - 1]?.value ?? null) === null && (all[index + 1]?.value ?? null) === null ? [{ index, value: point.value }] : []);
  const incomplete = labels.map((_, index) => available.some((series) => readPoint(points(series.id)[index], index === last).incomplete));
  const every = tickEvery(result.range.bucket, count, plotWidth);
  const narrow = width < 480;

  const pick = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(box.width, 1);
    setActive(Math.max(0, Math.min(count - 1, Math.floor(ratio * count))));
  };
  const onKey = (event: React.KeyboardEvent) => {
    const keys: Record<string, (current: number | null) => number> = {
      ArrowRight: (current) => (current ?? -1) + 1,
      ArrowLeft: (current) => (current ?? count) - 1,
      Home: () => 0,
      End: () => count - 1,
    };
    const move = keys[event.key];
    if (!move || !count) return;
    event.preventDefault();
    setActive((current) => Math.max(0, Math.min(count - 1, move(current))));
  };
  const toggle = (id: EnergyHistorySeriesName) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const derived = (id: EnergyHistorySeriesName) => result.series[id]?.source === 'derived';
  const unit = BUCKET_LABEL[result.range.bucket];

  return (
    <div className="energy-history-chart">
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Serie da mostrare">
        {available.map((series) => (
          <button
            key={series.id}
            type="button"
            aria-pressed={!hidden.has(series.id)}
            onClick={() => toggle(series.id)}
            className="flex min-h-8 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] px-2.5 text-[11px] font-semibold text-[color:var(--ui-text-secondary)] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)] aria-[pressed=false]:opacity-45 motion-reduce:transition-none"
          >
            <Swatch color={series.color} dash={series.dash} />
            {series.label}
            {derived(series.id) ? <span className="font-normal text-[color:var(--ui-text-tertiary)]">· calcolato</span> : null}
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
          aria-label={`Grafico dell’energia per ${unit}. Usa le frecce per leggere i valori.`}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]"
        >
          {last >= 0 ? (
            <rect data-testid="history-in-progress" x={x(last) - slot / 2} y={PAD.top} width={slot} height={base - PAD.top} fill="var(--ui-fill-tertiary)" />
          ) : null}
          {Array.from({ length: ticks + 1 }, (_, tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick * step)} y2={y(tick * step)} stroke="var(--ui-separator)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(tick * step) + 3} textAnchor="end" fontSize="10" fill="var(--ui-text-tertiary)">
                {formatKwh(tick * step)}
              </text>
            </g>
          ))}
          {incomplete.map((flag, index) => (flag ? (
            <rect key={labels[index].long} data-testid="history-incomplete" x={x(index) - 4} y={base + 3} width="8" height="3" rx="1.5" fill="var(--ui-warning)" />
          ) : null))}
          {labels.map((label, index) => ((count - 1 - index) % every === 0 ? (
            <text key={label.long} x={x(index)} y={HEIGHT - 6} textAnchor="middle" fontSize="10" fill="var(--ui-text-tertiary)">
              {label.short}
            </text>
          ) : null))}
          {active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={base} stroke="var(--ui-text-tertiary)" strokeWidth="1" /> : null}
          {visible.map((series) => (
            <g key={series.id} data-series={series.id}>
              <path d={path(series.id)} fill="none" stroke={series.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={series.dash} />
              {lonely(series.id).map((point) => <circle key={point.index} cx={x(point.index)} cy={y(point.value)} r="2.5" fill={series.color} />)}
            </g>
          ))}
          {active !== null
            ? visible.map((series) => {
                const value = points(series.id)[active]?.value ?? null;
                return value === null ? null : (
                  <circle key={series.id} cx={x(active)} cy={y(value)} r="4" fill={series.color} stroke="var(--ui-surface-primary)" strokeWidth="2" />
                );
              })
            : null}
          <rect
            x={PAD.left}
            y={0}
            width={plotWidth}
            height={base}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] px-3 py-2 shadow-[var(--ui-shadow-card)] backdrop-blur-md sm:min-w-[12rem]"
            style={narrow ? { left: 0, right: 0 } : x(active) > width / 2 ? { right: width - x(active) + 10 } : { left: x(active) + 10 }}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--ui-text-primary)]">
              <span className="flex-1 first-letter:uppercase">{labels[active].long}</span>
              {incomplete[active] ? <span className="text-[10px] font-semibold text-[color:var(--ui-warning)]">Dati incompleti</span> : null}
            </p>
            {visible.map((series) => {
              const reading = readPoint(points(series.id)[active], active === last);
              return (
                <div key={series.id} className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">
                  <p className="flex items-center gap-1.5">
                    <Swatch color={series.color} dash={series.dash} />
                    <span className="flex-1">{series.label}</span>
                    <span className="font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{reading.text}</span>
                  </p>
                  {reading.note || derived(series.id) ? (
                    <p className="pl-[22px] text-[10px] text-[color:var(--ui-text-tertiary)]">
                      {[reading.note, derived(series.id) ? 'Calcolato dal bilancio dei contatori' : null].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>Energia per {unit}, in kWh</caption>
        <thead>
          <tr>
            <th scope="col">Intervallo</th>
            {available.map((series) => <th key={series.id} scope="col">{series.label}{derived(series.id) ? ' (calcolato)' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={label.long}>
              <th scope="row">{label.long}</th>
              {available.map((series) => {
                const reading = readPoint(points(series.id)[index], index === last);
                return <td key={series.id}>{reading.note ? `${reading.text} (${reading.note})` : reading.text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
