import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { useI18n } from '../../i18n/I18nProvider';

/** The CPU trend of Settings › System; on its own so the chart library loads only here. */
export function MiniSparkline({ id, data }: { id: string; data: number[] }) {
  const { t } = useI18n();
  const chartData = useMemo(() => data.slice(-24).map((value, index) => ({ index, value })), [data]);
  if (chartData.length < 2) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-[color:var(--ui-surface-glass)] text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
        {t('settings.system.insufficientData')}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity={0.24} />
            <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="rgb(99,102,241)"
          strokeWidth={1.8}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default MiniSparkline;
