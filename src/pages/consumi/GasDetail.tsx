import React from 'react';
import { motion } from 'framer-motion';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flame } from 'lucide-react';
import { ChartCard, DetailScaffold, IntervalKey, PremiumTooltip, PreviewDataNotice } from './shared';
import { MOCK_DEVICES, OrbitalDevices } from './orbitalDevices';
import { useConsumptionCopy } from '../../i18n/consumptionCopy';

const GAS_MONTH_DATA = [
  { month: 0, consumo: 5.2 },
  { month: 1, consumo: 4.8 },
  { month: 2, consumo: 4.2 },
  { month: 3, consumo: 3.1 },
  { month: 4, consumo: 2.3 },
  { month: 5, consumo: 1.5 },
  { month: 6, consumo: 1.2 },
  { month: 7, consumo: 1.1 },
  { month: 8, consumo: 1.9 },
  { month: 9, consumo: 3.4 },
  { month: 10, consumo: 4.7 },
  { month: 11, consumo: 5.4 },
];

export function GasDetail({
  title,
  interval: _interval,
  onIntervalChange: _onIntervalChange,
  onBack,
}: {
  title: string;
  interval: IntervalKey;
  onIntervalChange: (value: IntervalKey) => void;
  onBack: () => void;
}) {
  const { c, formatDate } = useConsumptionCopy();
  const chartData = React.useMemo(() => GAS_MONTH_DATA.map((point) => ({
    ...point,
    label: formatDate(new Date(Date.UTC(2026, point.month, 15)), { month: 'short', timeZone: 'UTC' }),
  })), [formatDate]);
  const gasDevices = React.useMemo(
    () => MOCK_DEVICES.filter((device) => device.type === 'gas'),
    [],
  );

  const left = (
    <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-[#160e0a] bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.2)_0%,#160e0a_74%)]">
      <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.07)_0%,rgba(255,255,255,0.02)_40%,rgba(15,23,42,0.22)_100%)]" />

      <OrbitalDevices devices={gasDevices} centerX={50} centerY={50} radius={25} />

      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2">
        {[0, 0.38, 0.76].map((delay) => (
          <motion.div
            key={`gas-ring-${delay}`}
            className="absolute inset-0 rounded-full border border-orange-400/40"
            animate={{ scale: [1, 2.4], opacity: [0.56, 0] }}
            transition={{ duration: 2.3, repeat: Infinity, ease: 'easeOut', delay }}
          />
        ))}
        <motion.div
          className="absolute inset-0 z-10 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl"
          animate={{ boxShadow: ['0 0 0 rgba(251,146,60,0)', '0 0 44px rgba(251,146,60,0.42)', '0 0 0 rgba(251,146,60,0)'] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="flex h-full w-full items-center justify-center text-orange-200">
            <Flame size={108} />
          </div>
        </motion.div>
      </div>

      <p className="absolute bottom-6 left-6 text-sm text-white/65">{c('Visualizzazione Termica Gas')}</p>
    </div>
  );

  const right = (
    <>
      <PreviewDataNotice>
        {c('Il grafico mensile e i dispositivi mostrati sono esempi e non misurazioni dell’impianto.')}
      </PreviewDataNotice>
      <ChartCard title={c('Consumo mensile')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
      </ChartCard>
    </>
  );

  return <DetailScaffold title={title} onBack={onBack} left={left} right={right} />;
}

export default GasDetail;
