import React from 'react';
import { motion } from 'framer-motion';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CloudRain, Droplets, Home, Waves } from 'lucide-react';
import type { ConsumptionDashboardData, ConsumptionEntityConfig } from '../../hooks/useConsumptionConfig';
import { ChartCard, DetailScaffold, IntervalKey, PremiumTooltip, PreviewDataNotice } from './shared';
import { MOCK_DEVICES, OrbitalDevices } from './orbitalDevices';

type WaterMode = 'NORMALE' | 'PIOGGIA';

const WATER_WEEK_DATA = [
  { label: 'Lun', litri: 210 },
  { label: 'Mar', litri: 235 },
  { label: 'Mer', litri: 198 },
  { label: 'Gio', litri: 244 },
  { label: 'Ven', litri: 228 },
  { label: 'Sab', litri: 262 },
  { label: 'Dom', litri: 240 },
];

const RAIN_DROP_OFFSETS = [8, 16, 25, 33, 42, 51, 59, 67, 76, 84];

const FALLBACK_DATA: ConsumptionDashboardData = {
  waterCurrentLiters: 240,
  waterGoalLiters: 400,
  waterRainRecoveryLitersPerMin: 4.2,
  gasTodayCubicMeters: 1.2,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isConfigured(value?: string) {
  if (value === undefined) {
    return true;
  }
  return value.trim().length > 0;
}

function WaterNode({
  label,
  value,
  icon,
  positionClassName,
  accentClassName,
  active,
  large = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  positionClassName: string;
  accentClassName: string;
  active: boolean;
  large?: boolean;
}) {
  return (
    <motion.div
      className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-2 backdrop-blur-xl ${
        large ? 'h-24 w-24' : 'h-20 w-20'
      } ${positionClassName}`}
      animate={{
        boxShadow: active
          ? ['0 0 0 rgba(34,211,238,0)', '0 0 30px rgba(34,211,238,0.32)', '0 0 0 rgba(34,211,238,0)']
          : '0 0 0 rgba(34,211,238,0)',
        scale: active ? [1, 1.03, 1] : 1,
      }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className={`absolute inset-0 rounded-full opacity-80 ${accentClassName}`} />
      <div className="relative flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-black/35">
        <span className="text-white/90">{icon}</span>
        <p className="mt-1 text-[8.5px] uppercase tracking-[0.12em] text-white/60">{label}</p>
        <p className="text-[10.5px] font-semibold text-white">{value}</p>
      </div>
    </motion.div>
  );
}

function WaterFlowParticles({
  pathId,
  color,
  amount,
}: {
  pathId: string;
  color: string;
  amount: number;
}) {
  const count = clamp(Math.round(amount * 1.2), 2, 9);
  const duration = clamp(3.4 - Math.min(amount, 10) * 0.24, 1.25, 3.4);

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <g key={`${pathId}-${index}`}>
          <circle r="0.4" fill={color}>
            <animateMotion
              dur={`${duration}s`}
              begin={`${-(index * duration) / count}s`}
              repeatCount="indefinite"
              rotate="auto"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <circle r="0.95" fill={color} fillOpacity="0.2">
            <animateMotion
              dur={`${duration}s`}
              begin={`${-(index * duration) / count}s`}
              repeatCount="indefinite"
              rotate="auto"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </>
  );
}

export function AcquaDetail({
  title,
  interval: _interval,
  onIntervalChange: _onIntervalChange,
  onBack,
  dashboardData,
  config,
}: {
  title: string;
  interval: IntervalKey;
  onIntervalChange: (value: IntervalKey) => void;
  onBack: () => void;
  dashboardData?: ConsumptionDashboardData;
  config?: ConsumptionEntityConfig;
}) {
  const liveData = dashboardData ?? FALLBACK_DATA;
  const [mode, setMode] = React.useState<WaterMode>('NORMALE');

  const waterDevices = React.useMemo(
    () => MOCK_DEVICES.filter((device) => device.type === 'water'),
    [],
  );

  const rainSourceConfigured = isConfigured(config?.waterRainRecoveryEntityId);
  const currentLiters = Math.max(0, liveData.waterCurrentLiters);
  const goalLiters = Math.max(1, liveData.waterGoalLiters);
  const fillPct = clamp(Math.round((currentLiters / goalLiters) * 100), 20, 92);

  React.useEffect(() => {
    if (!rainSourceConfigured && mode === 'PIOGGIA') {
      setMode('NORMALE');
    }
  }, [mode, rainSourceConfigured]);

  const rainSensorFlow = rainSourceConfigured ? Math.max(0, liveData.waterRainRecoveryLitersPerMin) : 0;
  const homeFlowBase = clamp(liveData.waterCurrentLiters / 16, 6, 22);
  const homeFlow = Number((mode === 'PIOGGIA' ? homeFlowBase + 0.8 : homeFlowBase).toFixed(1));
  const rainFlow = Number(
    (
      rainSourceConfigured
        ? mode === 'PIOGGIA'
          ? rainSensorFlow
          : rainSensorFlow * 0.45
        : 0
    ).toFixed(1),
  );
  const gridFlow = Number(Math.max(0.6, homeFlow - rainFlow).toFixed(1));

  const sourceMix = React.useMemo(() => {
    if (!rainSourceConfigured) {
      return { rete: 100, pioggia: 0 };
    }

    const totalInput = gridFlow + rainFlow;
    if (totalInput <= 0) {
      return { rete: 100, pioggia: 0 };
    }

    const pioggia = clamp(Math.round((rainFlow / totalInput) * 100), 0, 100);
    return {
      rete: 100 - pioggia,
      pioggia,
    };
  }, [gridFlow, rainFlow, rainSourceConfigured]);

  const sourcePieData = React.useMemo(
    () =>
      rainSourceConfigured
        ? [
            { name: 'Rete Idrica', value: sourceMix.rete, color: '#38bdf8' },
            { name: 'Recupero Pioggia', value: sourceMix.pioggia, color: '#22d3ee' },
          ]
        : [{ name: 'Rete Idrica', value: 100, color: '#38bdf8' }],
    [rainSourceConfigured, sourceMix.pioggia, sourceMix.rete],
  );

  const left = (
    <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] bg-[#07131f] bg-[radial-gradient(circle_at_50%_48%,rgba(34,211,238,0.28)_0%,rgba(34,211,238,0.08)_42%,#07131f_78%)]">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_38%,rgba(15,23,42,0.24)_100%)]" />

      <motion.div
        className="absolute -inset-[25%] bg-[radial-gradient(circle,rgba(56,189,248,0.2)_0%,transparent_60%)]"
        animate={{ rotate: [0, 360], opacity: [0.32, 0.15, 0.32] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full max-h-full max-w-full aspect-square">
          <OrbitalDevices
            devices={waterDevices}
            centerX={50}
            centerY={35}
            radius={18}
            angleOffsetDeg={90}
            zClassName="z-20"
          />

          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
            <defs>
              <filter id="waterGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path id="water-grid-tank" d="M 18 62 L 34 62 L 44 64" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" strokeLinecap="round" />
            {rainSourceConfigured ? (
              <path id="water-rain-tank" d="M 78 22 L 78 42 L 59 62 L 54 64" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" strokeLinecap="round" />
            ) : null}
            <path id="water-tank-home" d="M 50 64 L 50 35" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" strokeLinecap="round" />

            <motion.path
              d="M 18 62 L 34 62 L 44 64"
              stroke="rgba(56,189,248,0.9)"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
              filter="url(#waterGlow)"
              animate={{ opacity: [0.45, 0.88, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            {rainSourceConfigured ? (
              <motion.path
                d="M 78 22 L 78 42 L 59 62 L 54 64"
                stroke="rgba(34,211,238,0.92)"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                filter="url(#waterGlow)"
                animate={{ opacity: mode === 'PIOGGIA' ? [0.5, 0.96, 0.5] : [0.2, 0.45, 0.2] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : null}

            <motion.path
              d="M 50 64 L 50 35"
              stroke="rgba(125,211,252,0.92)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              filter="url(#waterGlow)"
              animate={{ opacity: [0.5, 0.95, 0.5] }}
              transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
            />

            <WaterFlowParticles pathId="water-grid-tank" color="rgba(56,189,248,1)" amount={gridFlow} />
            {rainSourceConfigured ? (
              <WaterFlowParticles pathId="water-rain-tank" color="rgba(34,211,238,1)" amount={rainFlow} />
            ) : null}
            <WaterFlowParticles pathId="water-tank-home" color="rgba(125,211,252,1)" amount={homeFlow} />
          </svg>

          {mode === 'PIOGGIA' && rainSourceConfigured ? (
            <div className="pointer-events-none absolute left-[65%] top-[3%] z-10 h-[55%] w-[25%]">
              {RAIN_DROP_OFFSETS.map((offset, index) => (
                <motion.span
                  key={`drop-${offset}`}
                  className="absolute top-0 h-2 w-1.5 rounded-full bg-cyan-200/85 shadow-[0_0_10px_rgba(34,211,238,0.65)]"
                  style={{ left: `${offset}%` }}
                  animate={{ y: [0, 16, 38, 64, 90], opacity: [0, 0.9, 0.9, 0.5, 0] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: 'easeIn',
                    delay: index * 0.14,
                  }}
                />
              ))}
            </div>
          ) : null}

          <WaterNode
            label="Casa"
            value={`${currentLiters} L`}
            icon={<Home size={17} />}
            positionClassName="left-[50%] top-[35%]"
            accentClassName="bg-[radial-gradient(circle,rgba(125,211,252,0.4)_0%,transparent_72%)]"
            active={true}
            large={true}
          />

          <WaterNode
            label="Rete"
            value={`${gridFlow.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/m`}
            icon={<Waves size={15} />}
            positionClassName="left-[18%] top-[62%]"
            accentClassName="bg-[radial-gradient(circle,rgba(56,189,248,0.42)_0%,transparent_72%)]"
            active={true}
          />

          {rainSourceConfigured ? (
            <WaterNode
              label="Pioggia"
              value={`${rainFlow.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/m`}
              icon={<CloudRain size={15} />}
              positionClassName="left-[78%] top-[22%]"
              accentClassName="bg-[radial-gradient(circle,rgba(34,211,238,0.44)_0%,transparent_72%)]"
              active={mode === 'PIOGGIA'}
            />
          ) : null}

          <motion.div
            className="absolute left-1/2 top-[71%] z-20 h-48 w-36 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-cyan-100/30 bg-white/10 p-[3px] backdrop-blur-xl"
            animate={{
              boxShadow: [
                '0 0 0 rgba(34,211,238,0)',
                '0 0 34px rgba(34,211,238,0.3)',
                '0 0 0 rgba(34,211,238,0)',
              ],
            }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04]">
              <motion.div
                className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-cyan-600/85 via-cyan-400/82 to-cyan-200/75"
                style={{ height: `${fillPct}%` }}
                animate={{ filter: ['brightness(1)', 'brightness(1.1)', 'brightness(1)'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />

              <motion.div
                className="absolute left-[-28%] h-9 w-[160%] rounded-[45%] bg-cyan-100/45"
                style={{ bottom: `calc(${fillPct}% - 8px)` }}
                animate={{ x: [0, 26, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute left-[-20%] h-8 w-[145%] rounded-[42%] bg-cyan-200/25"
                style={{ bottom: `calc(${fillPct}% - 10px)` }}
                animate={{ x: [0, -22, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />

              <div className="absolute inset-0 flex flex-col items-center justify-center text-cyan-100/90">
                <Droplets size={44} />
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/80">Serbatoio</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3">
        <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium text-white/75 backdrop-blur-xl">
          Rete {sourceMix.rete}%
        </div>
        {rainSourceConfigured ? (
          <div className="rounded-full border border-white/10 bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-100 backdrop-blur-xl">
            Recupero Pioggia {sourceMix.pioggia}%
          </div>
        ) : (
          <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium text-white/65 backdrop-blur-xl">
            Recupero Pioggia non configurato
          </div>
        )}
      </div>

      <div className="absolute bottom-5 right-5 z-40 rounded-full border border-white/12 bg-white/10 p-1 backdrop-blur-xl">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('NORMALE')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'NORMALE' ? 'bg-white/20 text-white' : 'text-white/65 hover:bg-white/10'
            }`}
          >
            Normale
          </button>
          <button
            type="button"
            onClick={() => setMode('PIOGGIA')}
            disabled={!rainSourceConfigured}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'PIOGGIA' ? 'bg-cyan-400/30 text-cyan-50' : 'text-white/65 hover:bg-white/10'
            } ${!rainSourceConfigured ? 'cursor-not-allowed opacity-35' : ''}`}
          >
            Pioggia
          </button>
        </div>
      </div>

      <p className="absolute bottom-6 left-6 text-sm text-white/65">Visualizzazione Flusso Acqua</p>
    </div>
  );

  const right = (
    <>
      <PreviewDataNotice>
        Grafici storici, ripartizione e flussi calcolati non provengono ancora da statistiche Home Assistant.
      </PreviewDataNotice>
      <ChartCard title="Consumo ultimi 7 giorni">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={WATER_WEEK_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={14}>
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
      </ChartCard>

      <ChartCard title="Origine approvvigionamento">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="relative h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<PremiumTooltip suffix="%" />} />
                <Pie
                  data={sourcePieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={76}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.05)"
                >
                  {sourcePieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">Modalita</p>
                <p className="text-xl font-semibold text-[color:var(--ui-text-primary)]">{mode === 'PIOGGIA' ? 'Pioggia' : 'Normale'}</p>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[color:var(--ui-text-secondary)]">
            {sourcePieData.map((entry) => (
              <div key={`legend-${entry.name}`} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>
                  {entry.name} {entry.value.toLocaleString('it-IT', { maximumFractionDigits: 0 })}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Flusso istantaneo">
        <div className="space-y-4 pt-2">
          {[
            { label: 'Ingresso Rete', value: gridFlow, max: 18, color: 'rgba(56,189,248,0.88)' },
            ...(rainSourceConfigured
              ? [{ label: 'Recupero Pioggia', value: rainFlow, max: 18, color: 'rgba(34,211,238,0.9)' }]
              : []),
            { label: 'Uscita verso Casa', value: homeFlow, max: 18, color: 'rgba(125,211,252,0.92)' },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-[color:var(--ui-text-secondary)]">{row.label}</span>
                <span className="font-semibold text-[color:var(--ui-text-primary)]">
                  {row.value.toLocaleString('it-IT', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  L/m
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${row.color.replace('0.88', '0.6').replace('0.9', '0.6').replace('0.92', '0.6')} 0%, ${row.color} 100%)`,
                  }}
                  animate={{ width: `${clamp((row.value / row.max) * 100, 6, 100)}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </>
  );

  return <DetailScaffold title={title} onBack={onBack} left={left} right={right} />;
}

export default AcquaDetail;
