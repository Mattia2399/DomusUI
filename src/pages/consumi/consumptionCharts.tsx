import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PremiumTooltip } from './shared';

/*
 * The charts of the Water and Gas previews, the only Recharts charts of
 * Consumption. They load on their own, through LazyConsumptionChart, so the
 * overview, Energy and the rest of each detail never wait for the chart
 * library (docs/performance-energy-bundle.md).
 */

export type WaterWeekPoint = { label: string; litri: number };
export type WaterSourceSlice = { name: string; value: number; color: string };
export type GasMonthPoint = { label: string; consumo: number };

export function WaterWeekChart({ data }: { data: WaterWeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={14}>
        <defs>
          <linearGradient id="acquaBarFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.95)" />
            <stop offset="100%" stopColor="rgba(8,145,178,0.58)" />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={false} width={0} />
        <Tooltip content={<PremiumTooltip suffix=" L" />} />
        <Bar dataKey="litri" fill="url(#acquaBarFill)" radius={[10, 10, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaterSourceChart({ data }: { data: WaterSourceSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip content={<PremiumTooltip suffix="%" />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={48}
          outerRadius={76}
          startAngle={90}
          endAngle={-270}
          paddingAngle={2}
          stroke="rgba(255,255,255,0.05)"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GasMonthChart({ data }: { data: GasMonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <filter id="gasLineGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--ui-text-tertiary)', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={false} width={0} />
        <Tooltip content={<PremiumTooltip suffix=" Sm3" />} />
        <Line
          type="monotone"
          dataKey="consumo"
          stroke="rgba(251,146,60,0.98)"
          strokeWidth={4}
          dot={false}
          filter="url(#gasLineGlow)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
