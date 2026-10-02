import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Battery, CarFront, Home, SunMedium, TowerControl } from 'lucide-react';
import type { EnergyModuleId } from '../../../services/energyCoreClient';
import type { FlowNodeView, FlowView } from './energyModel';

type NodeLayout = { x: number; y: number; color: string; accent: string; icon: React.ReactNode };

// Positions in the 100x100 diagram; Home stays at the centre.
const LAYOUT: Record<Exclude<EnergyModuleId, 'home'>, NodeLayout> = {
  solar: { x: 50, y: 17, color: '250,204,21', accent: 'rgba(250,204,21,0.4)', icon: <SunMedium size={18} /> },
  grid: { x: 22, y: 80, color: '96,165,250', accent: 'rgba(96,165,250,0.42)', icon: <TowerControl size={18} /> },
  battery: { x: 82, y: 50, color: '34,197,94', accent: 'rgba(34,197,94,0.35)', icon: <Battery size={18} /> },
  wallbox: { x: 78, y: 80, color: '192,132,252', accent: 'rgba(192,132,252,0.38)', icon: <CarFront size={18} /> },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function NodeChip({
  label,
  value,
  caption,
  icon,
  x,
  y,
  accent,
  active,
  online,
  center = false,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: React.ReactNode;
  x: number;
  y: number;
  accent: string;
  active: boolean;
  online: boolean;
  center?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-white/10 p-2 backdrop-blur-xl ${
        online ? 'border-white/20' : 'border-dashed border-white/25 opacity-60'
      } ${center ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-20 w-20 sm:h-24 sm:w-24'}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      animate={{
        boxShadow: active && !reduceMotion
          ? ['0 0 0 rgba(255,255,255,0)', '0 0 32px rgba(255,255,255,0.3)', '0 0 0 rgba(255,255,255,0)']
          : '0 0 0 rgba(255,255,255,0)',
      }}
      transition={{ duration: 2.3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 rounded-full opacity-70" style={{ background: `radial-gradient(circle, ${accent} 0%, transparent 72%)` }} />
      <div className="relative flex h-full w-full flex-col items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-center shadow-lg">
        <span className="text-white/85">{icon}</span>
        <p className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-white/60 sm:text-[9px]">{label}</p>
        <p className="text-[10px] font-semibold text-white sm:text-[11px]">{value}</p>
        {caption ? <p className="max-w-full truncate px-1 text-[7px] text-white/55 sm:text-[8px]">{caption}</p> : null}
      </div>
    </motion.div>
  );
}

// Glowing darts travelling along a flow path.
function FlowLasers({ pathId, color, amountW }: { pathId: string; color: string; amountW: number }) {
  const kw = amountW / 1000;
  const count = clamp(Math.ceil(kw), 1, 7);
  const duration = clamp(3.6 - Math.min(kw, 7) * 0.3, 1.2, 3.6);
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <g key={`${pathId}-${index}`}>
          {[0.42, 0.92].map((radius) => (
            <circle key={radius} r={radius} fill={`rgb(${color})`} fillOpacity={radius > 0.5 ? 0.22 : 1}>
              <animateMotion dur={`${duration}s`} begin={`${-(index * duration) / count}s`} repeatCount="indefinite">
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          ))}
        </g>
      ))}
    </>
  );
}

function describe(view: FlowView) {
  const parts = view.nodes.map((node) =>
    `${node.label}: ${node.online ? node.value : 'offline'}${node.caption && node.online ? ` ${node.caption}` : ''}`);
  parts.push(`Casa: ${view.home.value} ${view.home.caption}`);
  return `Flussi energetici. ${parts.join('; ')}.`;
}

export function EnergyFlowDiagram({ view, homeVisual }: { view: FlowView; homeVisual?: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const idPrefix = `energy-flow-${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const active = (node: FlowNodeView) => node.online && node.direction !== 'idle';

  return (
    <div className="relative aspect-square h-full max-h-[min(100%,38rem)] w-full max-w-[38rem]" role="img" aria-label={describe(view)}>
      <div className="absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
      <div className="absolute left-1/2 top-1/2 h-[90%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.02]" />

      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <filter id={`${idPrefix}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {view.nodes.map((node) => {
          const layout = LAYOUT[node.id as keyof typeof LAYOUT];
          const toHome = `M ${layout.x} ${layout.y} L 50 50`;
          const path = node.direction === 'out' ? `M 50 50 L ${layout.x} ${layout.y}` : toHome;
          const pathId = `${idPrefix}-${node.id}`;
          return (
            <g key={node.id} data-flow-direction={node.direction} data-flow-online={node.online ? 'true' : 'false'}>
              <path
                id={pathId}
                d={path}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="2"
                strokeDasharray={node.online ? undefined : '2 2'}
                fill="none"
                strokeLinecap="round"
              />
              {active(node) ? (
                <>
                  <motion.path
                    d={path}
                    stroke={`rgba(${layout.color},0.8)`}
                    strokeWidth="2.4"
                    fill="none"
                    strokeLinecap="round"
                    filter={`url(#${idPrefix}-glow)`}
                    animate={{ opacity: reduceMotion ? 0.75 : [0.4, 0.9, 0.4] }}
                    transition={{ duration: 2.2, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
                  />
                  {reduceMotion ? null : <FlowLasers pathId={pathId} color={layout.color} amountW={node.amountW} />}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>

      {view.nodes.map((node) => {
        const layout = LAYOUT[node.id as keyof typeof LAYOUT];
        return (
          <NodeChip
            key={node.id}
            label={node.label}
            value={node.online ? node.value : '—'}
            caption={node.caption}
            icon={layout.icon}
            x={layout.x}
            y={layout.y}
            accent={layout.accent}
            active={active(node)}
            online={node.online}
          />
        );
      })}
      {homeVisual ? (
        <div className="absolute left-1/2 top-1/2 z-10 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 sm:h-[46%] sm:w-[46%]">
          {homeVisual}
          <div className="absolute bottom-0 left-1/2 min-w-24 -translate-x-1/2 translate-y-1/2 rounded-full border border-white/15 bg-[#07111b]/85 px-3 py-1.5 text-center shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/55">Casa</p>
            <p className="text-sm font-semibold text-white sm:text-base">{view.home.value}</p>
            <p className="text-[8px] text-white/50 sm:text-[9px]">{view.home.caption}</p>
          </div>
        </div>
      ) : (
        <NodeChip
          label="Casa"
          value={view.home.value}
          caption={view.home.caption}
          icon={<Home size={22} />}
          x={50}
          y={50}
          accent="rgba(255,255,255,0.4)"
          active={view.nodes.some(active)}
          online={view.home.online}
          center
        />
      )}
    </div>
  );
}
