import React from 'react';
import type { SensorVisualGroup } from '../../utils/sensorPresentation';
import {
  buildSensorHeroPresentation,
  type SensorHeroPresentation,
  type SensorHeroStatusTone,
} from './sensorHeroModel';

type SensorHeroVisualProps = {
  group: SensorVisualGroup;
  value: string;
  numericValue?: number;
  unit?: string;
  deviceClass?: string;
  history?: number[];
  status?: string;
};

type SvgValueProps = {
  value: string;
  unit?: string;
  presentation: SensorHeroPresentation;
};

type HeroVisualProps = {
  value: string;
  unit?: string;
  presentation: SensorHeroPresentation;
};

function useSvgId(prefix: string) {
  return `${prefix}-${React.useId().replace(/:/g, '')}`;
}

const STATUS_TONE_COLORS: Record<SensorHeroStatusTone, string> = {
  good: '#6ee7b7',
  warning: '#fbbf24',
  critical: '#fb7185',
  neutral: '#bae6fd',
};

function ProgressArc({ progress, accent }: { progress: number; accent: string }) {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  if (normalizedProgress <= 0) return null;

  return (
    <circle
      cx="160"
      cy="160"
      r="124"
      pathLength="100"
      fill="none"
      stroke={accent}
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeDasharray={`${(normalizedProgress * 100).toFixed(2)} 100`}
      transform="rotate(-90 160 160)"
      opacity="0.76"
      style={{ transition: 'stroke-dasharray 500ms ease' }}
      aria-hidden="true"
    />
  );
}

function SvgValue({ value, unit, presentation }: SvgValueProps) {
  const valueFontSize = value.length >= 9 ? 34 : value.length >= 7 ? 40 : value.length >= 5 ? 48 : 58;
  const unitLabel = unit?.trim();
  const hasDetails = Boolean(presentation.status || presentation.trend);
  const valueY = unitLabel ? (hasDetails ? 130 : 148) : hasDetails ? 143 : 158;
  const unitY = hasDetails ? 158 : 177;
  const statusLabel = presentation.status?.label;
  const statusWidth = statusLabel ? Math.min(164, Math.max(76, statusLabel.length * 6.5 + 34)) : 0;
  const statusColor = presentation.status
    ? STATUS_TONE_COLORS[presentation.status.tone]
    : STATUS_TONE_COLORS.neutral;
  const trendLabel = presentation.trend?.label;
  const trendFontSize = trendLabel && trendLabel.length > 25 ? 10 : 11;

  return (
    <g className="pointer-events-none select-none" textAnchor="middle">
      <text
        x="160"
        y={valueY}
        fill="white"
        fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
        fontSize={valueFontSize}
        fontWeight="250"
        letterSpacing="-1.4"
      >
        {value}
      </text>
      {unitLabel ? (
        <text
          x="160"
          y={unitY}
          fill="rgba(226,232,240,0.78)"
          fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
          fontSize={unitLabel.length > 10 ? 11 : 15}
          fontWeight="450"
        >
          {unitLabel}
        </text>
      ) : null}
      {presentation.status ? (
        <g transform="translate(0 174)">
          <rect
            x={160 - statusWidth / 2}
            y="0"
            width={statusWidth}
            height="24"
            rx="12"
            fill="rgba(255,255,255,0.075)"
            stroke="rgba(255,255,255,0.13)"
          />
          <circle cx={160 - statusWidth / 2 + 14} cy="12" r="3.2" fill={statusColor} />
          <text
            x={160 - statusWidth / 2 + 24}
            y="15.5"
            textAnchor="start"
            fill="rgba(255,255,255,0.88)"
            fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
            fontSize="11"
            fontWeight="600"
          >
            {presentation.status.label}
          </text>
        </g>
      ) : null}
      {trendLabel ? (
        <text
          x="160"
          y={presentation.status ? 218 : 202}
          fill="rgba(226,232,240,0.66)"
          fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
          fontSize={trendFontSize}
          fontWeight="500"
          letterSpacing="0.1"
        >
          {trendLabel}
        </text>
      ) : null}
    </g>
  );
}

function EnvironmentVisual({ value, unit, presentation }: HeroVisualProps) {
  const clipId = useSvgId('sensor-atmosphere-clip');
  const orbCoreId = useSvgId('sensor-atmosphere-core');
  const auroraBackId = useSvgId('sensor-atmosphere-aurora-back');
  const auroraFrontId = useSvgId('sensor-atmosphere-aurora-front');
  const glowId = useSvgId('sensor-atmosphere-glow');
  const blurId = useSvgId('sensor-atmosphere-blur');
  const shadowId = useSvgId('sensor-atmosphere-shadow');
  const unitLabel = unit?.trim();
  const waveOffset = Math.round(228 * (0.34 - presentation.progress));

  return (
    <svg
      viewBox="0 0 320 320"
      className="h-full w-full"
      role="img"
      aria-label={`Valore ambientale ${value}${unitLabel ? ` ${unitLabel}` : ''}${presentation.status ? `, ${presentation.status.label}` : ''}${presentation.trend ? `, ${presentation.trend.label}` : ''}`}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="160" cy="160" r="116" />
        </clipPath>
        <radialGradient id={orbCoreId} cx="34%" cy="22%" r="82%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="0.32" stopColor="#d1fae5" stopOpacity="0.055" />
          <stop offset="0.72" stopColor="#0f766e" stopOpacity="0.055" />
          <stop offset="1" stopColor="#022c22" stopOpacity="0.12" />
        </radialGradient>
        <linearGradient id={auroraBackId} x1="65" y1="178" x2="260" y2="267" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#86efac" stopOpacity="0.52" />
          <stop offset="0.52" stopColor="#5eead4" stopOpacity="0.42" />
          <stop offset="1" stopColor="#14b8a6" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={auroraFrontId} x1="65" y1="196" x2="250" y2="278" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4ade80" stopOpacity="0.62" />
          <stop offset="0.5" stopColor="#2dd4bf" stopOpacity="0.58" />
          <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.18" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4.5" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id={shadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#34d399" floodOpacity="0.16" />
        </filter>
      </defs>

      <circle
        cx="160"
        cy="160"
        r="124"
        fill="rgba(255,255,255,0.045)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1.5"
        filter={`url(#${shadowId})`}
      />
      <circle cx="160" cy="160" r="116" fill={`url(#${orbCoreId})`} stroke="rgba(167,243,208,0.13)" />

      <g clipPath={`url(#${clipId})`}>
        <ellipse
          cx="118"
          cy="84"
          rx="76"
          ry="30"
          transform="rotate(-18 118 84)"
          fill="rgba(255,255,255,0.07)"
        />
        <g transform={`translate(0 ${waveOffset})`}>
          <path
          d="M34 218C69 178 100 173 130 191C154 205 169 213 190 196C220 172 251 181 286 221V292H34Z"
          fill={`url(#${auroraBackId})`}
          filter={`url(#${blurId})`}
          opacity="0.8"
        >
          <animateTransform attributeName="transform" type="translate" values="-8 0;8 -5;-8 0" dur="9s" repeatCount="indefinite" />
        </path>
        <path
          d="M27 242C66 201 102 197 134 218C158 234 176 238 199 217C228 191 257 203 293 244V294H27Z"
          fill={`url(#${auroraFrontId})`}
          filter={`url(#${blurId})`}
          opacity="0.88"
        >
          <animateTransform attributeName="transform" type="translate" values="9 0;-7 -4;9 0" dur="7s" repeatCount="indefinite" />
        </path>
        <path
          d="M72 245C103 222 127 222 151 240C170 254 187 254 208 237C230 219 250 222 270 241V287H51V263C57 256 64 250 72 245Z"
          fill="rgba(110,231,183,0.2)"
          filter={`url(#${blurId})`}
          />
          {[
          { cx: 89, cy: 205, r: 2.6, opacity: 0.48, duration: '6.8s' },
          { cx: 112, cy: 222, r: 1.8, opacity: 0.4, duration: '5.4s' },
          { cx: 137, cy: 198, r: 2.2, opacity: 0.5, duration: '7.6s' },
          { cx: 188, cy: 218, r: 2.5, opacity: 0.42, duration: '6.2s' },
          { cx: 218, cy: 202, r: 2, opacity: 0.46, duration: '8s' },
          { cx: 240, cy: 226, r: 2.8, opacity: 0.38, duration: '5.8s' },
          ].map((particle, index) => (
            <circle
              key={particle.cx}
              cx={particle.cx}
              cy={particle.cy}
              r={particle.r}
              fill="#a7f3d0"
              opacity={particle.opacity}
              filter={`url(#${glowId})`}
            >
              <animate
                attributeName="cy"
                values={`${particle.cy};${particle.cy - 70};${particle.cy}`}
                dur={particle.duration}
                begin={`${index * -0.7}s`}
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values={`${particle.opacity};0.12;${particle.opacity}`} dur={particle.duration} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      </g>

      <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(209,250,229,0.18)" />
      <ProgressArc progress={presentation.progress} accent="#5eead4" />
      <SvgValue value={value} unit={unit} presentation={presentation} />
    </svg>
  );
}

function FluidVisual({ value, unit, presentation }: HeroVisualProps) {
  const clipId = useSvgId('sensor-fluid-clip');
  const backWaveId = useSvgId('sensor-fluid-wave-back');
  const middleWaveId = useSvgId('sensor-fluid-wave-middle');
  const frontWaveId = useSvgId('sensor-fluid-wave-front');
  const glowId = useSvgId('sensor-fluid-glow');
  const shadowId = useSvgId('sensor-fluid-shadow');
  const waveOffset = Math.round(180 * (0.45 - presentation.progress));

  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={`Valore di consumo ${value}${unit ? ` ${unit}` : ''}${presentation.status ? `, ${presentation.status.label}` : ''}${presentation.trend ? `, ${presentation.trend.label}` : ''}`}>
      <defs>
        <clipPath id={clipId}><circle cx="160" cy="160" r="116" /></clipPath>
        <linearGradient id={backWaveId} x1="160" y1="145" x2="160" y2="292" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0.32" />
          <stop offset="1" stopColor="#0891b2" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={middleWaveId} x1="160" y1="165" x2="160" y2="295" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.44" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0.64" />
        </linearGradient>
        <linearGradient id={frontWaveId} x1="160" y1="190" x2="160" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563eb" stopOpacity="0.55" />
          <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.82" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id={shadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#0ea5e9" floodOpacity="0.2" />
        </filter>
      </defs>
      <circle cx="160" cy="160" r="124" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" filter={`url(#${shadowId})`} />
      <circle cx="160" cy="160" r="116" fill="rgba(14,165,233,0.045)" stroke="rgba(186,230,253,0.13)" />
      <g clipPath={`url(#${clipId})`}>
        <ellipse cx="118" cy="86" rx="70" ry="27" fill="rgba(255,255,255,0.045)" transform="rotate(-18 118 86)" />
        <g transform={`translate(0 ${waveOffset})`}>
          <path
          d="M-180 164C-130 132-80 132-30 164S70 196 120 164s150-32 200 0 150 32 200 0 150-32 200 0v190H-180Z"
          fill={`url(#${backWaveId})`}
        >
          <animateTransform attributeName="transform" type="translate" values="-65 0;35 0;-65 0" dur="10s" repeatCount="indefinite" />
        </path>
        <path
          d="M-200 184C-155 158-110 204-65 184s90-20 135 0 90 20 135 0 90-20 135 0 90 20 135 0 90-20 135 0v170H-200Z"
          fill={`url(#${middleWaveId})`}
        >
          <animateTransform attributeName="transform" type="translate" values="45 0;-55 0;45 0" dur="7.5s" repeatCount="indefinite" />
        </path>
        <path
          d="M-180 207C-110 176-40 238 30 207s140-31 210 0 140 31 210 0 140-31 210 0v150H-180Z"
          fill={`url(#${frontWaveId})`}
        >
          <animateTransform attributeName="transform" type="translate" values="-40 0;55 0;-40 0" dur="6s" repeatCount="indefinite" />
        </path>
          <g fill="#bae6fd" filter={`url(#${glowId})`}>
            <circle cx="88" cy="226" r="3.8" opacity="0.45"><animate attributeName="cy" values="230;126;230" dur="7.2s" repeatCount="indefinite" /></circle>
            <circle cx="231" cy="238" r="2.6" opacity="0.55"><animate attributeName="cy" values="240;146;240" dur="5.8s" repeatCount="indefinite" /></circle>
            <circle cx="190" cy="258" r="1.9" opacity="0.5"><animate attributeName="cy" values="260;166;260" dur="6.6s" repeatCount="indefinite" /></circle>
          </g>
        </g>
      </g>
      <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(224,242,254,0.18)" />
      <ProgressArc progress={presentation.progress} accent="#38bdf8" />
      <SvgValue value={value} unit={unit} presentation={presentation} />
    </svg>
  );
}

function MeasurementVisual({ value, unit, presentation }: HeroVisualProps) {
  const gradientId = useSvgId('sensor-telemetry-gradient');
  const glowId = useSvgId('sensor-telemetry-glow');
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15);

  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={`Valore di misurazione ${value}${unit ? ` ${unit}` : ''}${presentation.status ? `, ${presentation.status.label}` : ''}${presentation.trend ? `, ${presentation.trend.label}` : ''}`}>
      <defs>
        <linearGradient id={gradientId} x1="52" y1="45" x2="270" y2="270" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.52" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx="160" cy="160" r="126" fill="rgba(99,102,241,0.025)" stroke="rgba(165,180,252,0.12)" />
      <circle cx="160" cy="160" r="108" fill="none" stroke="rgba(125,211,252,0.18)" strokeDasharray="2 8" />
      <circle cx="160" cy="160" r="82" fill="rgba(14,165,233,0.025)" stroke="rgba(196,181,253,0.14)" />
      <path d="M42 160h236M160 42v236" stroke="rgba(125,211,252,0.12)" strokeWidth="1" />
      <path d="M76 76l168 168M244 76 76 244" stroke="rgba(196,181,253,0.08)" strokeWidth="1" />
      <g>
        {ticks.map((angle, index) => (
          <line
            key={angle}
            x1="160"
            y1={index % 3 === 0 ? 29 : 33}
            x2="160"
            y2="39"
            stroke={index % 3 === 0 ? 'rgba(196,181,253,0.58)' : 'rgba(125,211,252,0.27)'}
            strokeWidth={index % 3 === 0 ? 1.8 : 1}
            transform={`rotate(${angle} 160 160)`}
          />
        ))}
      </g>
      <g filter={`url(#${glowId})`}>
        <path d="M160 39a121 121 0 0 1 115 84" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" />
        <circle cx="259" cy="91" r="4.5" fill="#38bdf8" />
        <circle cx="88" cy="226" r="3.5" fill="#a78bfa" />
      </g>
      <g style={{ transformOrigin: '160px 160px' }}>
        <path d="M160 160 224 112" stroke="rgba(125,211,252,0.5)" strokeWidth="1.4" strokeDasharray="4 5" />
        <circle cx="224" cy="112" r="3.5" fill="#67e8f9" filter={`url(#${glowId})`} />
        <animateTransform attributeName="transform" type="rotate" from="0 160 160" to="360 160 160" dur="14s" repeatCount="indefinite" />
      </g>
      <ProgressArc progress={presentation.progress} accent="#a78bfa" />
      <SvgValue value={value} unit={unit} presentation={presentation} />
    </svg>
  );
}

function EnergyVisual({ value, unit, presentation }: HeroVisualProps) {
  const clipId = useSvgId('sensor-energy-clip');
  const orbCoreId = useSvgId('sensor-energy-core');
  const heatId = useSvgId('sensor-energy-heat');
  const backWaveId = useSvgId('sensor-energy-wave-back');
  const middleWaveId = useSvgId('sensor-energy-wave-middle');
  const frontWaveId = useSvgId('sensor-energy-wave-front');
  const crestId = useSvgId('sensor-energy-crest');
  const glowId = useSvgId('sensor-energy-glow');
  const blurId = useSvgId('sensor-energy-blur');
  const shadowId = useSvgId('sensor-energy-shadow');

  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={`Valore energetico ${value}${unit ? ` ${unit}` : ''}${presentation.status ? `, ${presentation.status.label}` : ''}${presentation.trend ? `, ${presentation.trend.label}` : ''}`}>
      <defs>
        <clipPath id={clipId}><circle cx="160" cy="160" r="116" /></clipPath>
        <radialGradient id={orbCoreId} cx="34%" cy="22%" r="86%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="0.34" stopColor="#fde68a" stopOpacity="0.055" />
          <stop offset="0.76" stopColor="#f97316" stopOpacity="0.055" />
          <stop offset="1" stopColor="#431407" stopOpacity="0.14" />
        </radialGradient>
        <linearGradient id={heatId} x1="84" y1="270" x2="246" y2="184" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.3" />
          <stop offset="0.48" stopColor="#f59e0b" stopOpacity="0.38" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={backWaveId} x1="160" y1="178" x2="160" y2="302" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.16" />
          <stop offset="0.58" stopColor="#f59e0b" stopOpacity="0.24" />
          <stop offset="1" stopColor="#7c2d12" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={middleWaveId} x1="160" y1="196" x2="160" y2="306" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fde047" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fb923c" stopOpacity="0.28" />
          <stop offset="1" stopColor="#9a3412" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={frontWaveId} x1="160" y1="216" x2="160" y2="310" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef08a" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#f97316" stopOpacity="0.32" />
          <stop offset="1" stopColor="#431407" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id={crestId} x1="38" y1="226" x2="286" y2="226" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fb923c" stopOpacity="0.18" />
          <stop offset="0.42" stopColor="#fef08a" stopOpacity="0.72" />
          <stop offset="1" stopColor="#f97316" stopOpacity="0.26" />
        </linearGradient>
        <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="3.4" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={blurId} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={shadowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="10" stdDeviation="18" floodColor="#f59e0b" floodOpacity="0.18" />
        </filter>
      </defs>
      <circle cx="160" cy="160" r="124" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" filter={`url(#${shadowId})`} />
      <circle cx="160" cy="160" r="116" fill={`url(#${orbCoreId})`} stroke="rgba(254,215,170,0.13)" />
      <g clipPath={`url(#${clipId})`}>
        <ellipse cx="118" cy="86" rx="70" ry="27" fill="rgba(255,255,255,0.045)" transform="rotate(-18 118 86)" />
        <ellipse cx="160" cy="249" rx="116" ry="52" fill={`url(#${heatId})`} filter={`url(#${blurId})`}>
          <animate attributeName="opacity" values="0.48;0.72;0.48" dur="6.2s" repeatCount="indefinite" />
        </ellipse>
        <path
          d="M38 256C80 240 118 250 158 238s84-22 124-4v106H38Z"
          fill="rgba(249,115,22,0.08)"
          filter={`url(#${blurId})`}
        >
          <animateTransform attributeName="transform" type="translate" values="-12 0;12 0;-12 0" dur="11s" repeatCount="indefinite" />
        </path>
        <path
          d="M-180 201C-130 181-80 181-30 201S70 221 120 201s150-20 200 0 150 20 200 0 150-20 200 0v150H-180Z"
          fill={`url(#${backWaveId})`}
          opacity="0.72"
        >
          <animateTransform attributeName="transform" type="translate" values="-54 0;30 0;-54 0" dur="12s" repeatCount="indefinite" />
        </path>
        <path
          d="M-200 218C-155 203-110 230-65 218s90-12 135 0 90 12 135 0 90-12 135 0 90 12 135 0 90-12 135 0v132H-200Z"
          fill={`url(#${middleWaveId})`}
          opacity="0.62"
        >
          <animateTransform attributeName="transform" type="translate" values="36 0;-50 0;36 0" dur="8.5s" repeatCount="indefinite" />
        </path>
        <path
          d="M-180 235C-116 216-52 254 12 235s128-19 192 0 128 19 192 0 128-19 192 0v116H-180Z"
          fill={`url(#${frontWaveId})`}
          opacity="0.54"
        >
          <animateTransform attributeName="transform" type="translate" values="-34 0;46 0;-34 0" dur="7.2s" repeatCount="indefinite" />
        </path>
        <path
          d="M43 223C73 217 92 230 121 224s54-20 86-5 51 21 81 7"
          fill="none"
          stroke={`url(#${crestId})`}
          strokeWidth="2.2"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          opacity="0.56"
        >
          <animateTransform attributeName="transform" type="translate" values="-18 0;18 0;-18 0" dur="6.5s" repeatCount="indefinite" />
        </path>
        <path
          d="M42 239C85 236 113 243 151 238s76-15 138-4"
          fill="none"
          stroke="rgba(254,243,199,0.32)"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        >
          <animateTransform attributeName="transform" type="translate" values="22 0;-20 0;22 0" dur="9s" repeatCount="indefinite" />
        </path>
        <g fill="#fef3c7" filter={`url(#${glowId})`}>
          <circle cx="82" cy="231" r="1.55" opacity="0.34"><animate attributeName="cy" values="233;219;233" dur="4.8s" repeatCount="indefinite" /></circle>
          <circle cx="126" cy="226" r="1.1" opacity="0.28"><animate attributeName="opacity" values="0.12;0.46;0.12" dur="4s" repeatCount="indefinite" /></circle>
          <circle cx="226" cy="222" r="1.35" opacity="0.32"><animate attributeName="cy" values="224;208;224" dur="5.2s" repeatCount="indefinite" /></circle>
          <circle cx="266" cy="217" r="1.05" opacity="0.28"><animate attributeName="opacity" values="0.1;0.44;0.1" dur="3.4s" repeatCount="indefinite" /></circle>
        </g>
      </g>
      <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(254,243,199,0.18)" />
      <ProgressArc progress={presentation.progress} accent="#fbbf24" />
      <SvgValue value={value} unit={unit} presentation={presentation} />
    </svg>
  );
}

function GenericVisual({ value, unit, presentation }: HeroVisualProps) {
  const gradientId = useSvgId('sensor-generic-gradient');

  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" role="img" aria-label={`Valore sensore ${value}${unit ? ` ${unit}` : ''}${presentation.status ? `, ${presentation.status.label}` : ''}${presentation.trend ? `, ${presentation.trend.label}` : ''}`}>
      <defs>
        <linearGradient id={gradientId} x1="60" y1="50" x2="260" y2="270" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#94a3b8" stopOpacity="0.72" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0.48" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r="121" fill="rgba(148,163,184,0.035)" stroke={`url(#${gradientId})`} strokeWidth="1.8" />
      <circle cx="160" cy="160" r="103" fill="none" stroke="rgba(148,163,184,0.13)" strokeDasharray="4 8" />
      <path d="M160 35a125 125 0 0 1 109 64" fill="none" stroke="rgba(125,211,252,0.48)" strokeWidth="3" strokeLinecap="round" />
      <ProgressArc progress={presentation.progress} accent="#7dd3fc" />
      <SvgValue value={value} unit={unit} presentation={presentation} />
    </svg>
  );
}

export function SensorHeroVisual({
  group,
  value,
  numericValue,
  unit,
  deviceClass,
  history,
  status,
}: SensorHeroVisualProps) {
  const presentation = buildSensorHeroPresentation({
    value: numericValue,
    unit,
    deviceClass,
    history,
    status,
  });
  const visualProps = { value, unit, presentation };

  if (group === 'environment') {
    return <EnvironmentVisual {...visualProps} />;
  }
  if (group === 'fluid') {
    return <FluidVisual {...visualProps} />;
  }
  if (group === 'measurement') {
    return <MeasurementVisual {...visualProps} />;
  }
  if (group === 'energy') {
    return <EnergyVisual {...visualProps} />;
  }
  return <GenericVisual {...visualProps} />;
}
