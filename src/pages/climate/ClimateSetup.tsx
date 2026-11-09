import { useState } from 'react';
import { ArrowRight, CalendarDays, CircleDashed, Flame, House, Radio, Thermometer, TriangleAlert, Wind } from 'lucide-react';
import GlassButton from '../../components/ui/GlassButton';
import { useClimateCopy, type ClimateCopyKey } from './climateCopy';
import { ClimateIcon, ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';

const steps: readonly { title: ClimateCopyKey; detail: ClimateCopyKey; icon: typeof House }[] = [
  { title: 'setupZones', detail: 'setupZonesDetail', icon: House },
  { title: 'setupDevices', detail: 'setupDevicesDetail', icon: Wind },
  { title: 'setupCircuit', detail: 'setupCircuitDetail', icon: Flame },
  { title: 'setupSensors', detail: 'setupSensorsDetail', icon: Thermometer },
  { title: 'setupSchedule', detail: 'setupScheduleDetail', icon: CalendarDays },
];
const missing: readonly { key: ClimateCopyKey; icon: typeof House }[] = [
  { key: 'missingZone', icon: House }, { key: 'missingDevice', icon: Wind },
  { key: 'missingSensor', icon: Radio }, { key: 'missingGenerator', icon: Flame },
  { key: 'missingSchedule', icon: CalendarDays },
];

export function ClimateSetup({ onPreview, onConfigure, canManage = false }: { onPreview: () => void; onConfigure?: () => void; canManage?: boolean }) {
  const { c } = useClimateCopy();
  const [activeStep, setActiveStep] = useState(0);
  const selected = steps[activeStep];
  return <div className="space-y-8">
    <section className={`${PANEL} relative overflow-hidden p-5 sm:p-8`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-400/15 blur-3xl" />
      <div className="relative grid gap-7 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
        <div><div className="flex items-center gap-3"><ClimateIcon icon={House} /><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">{c('notConfigured')}</span></div>
          <p className={`mt-7 text-[11px] font-bold uppercase tracking-[0.2em] ${MUTED}`}>{c('eyebrow')}</p>
          <h2 className="mt-2 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.055em] text-[color:var(--ui-text-primary)] sm:text-4xl">{c('intro')}</h2>
          <p className={`mt-4 max-w-xl text-sm leading-6 ${MUTED}`}>{c('introDetail')}</p>
          <div className="mt-6 flex flex-wrap gap-3">{canManage && onConfigure && <GlassButton variant="primary" onClick={onConfigure} className="inline-flex items-center gap-2">Configura Domus Climate<ArrowRight size={17} /></GlassButton>}<GlassButton variant={canManage ? 'ghost' : 'primary'} onClick={onPreview} className="inline-flex items-center gap-2">{c('previewOpen')}<ArrowRight size={17} /></GlassButton></div>
        </div>
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          <div className="col-span-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4"><House className="text-orange-500" /><span className={`mt-3 block text-xs ${MUTED}`}>{c('setupZones')}</span><span className="mt-1 block text-lg font-semibold text-[color:var(--ui-text-primary)]">{c('planned')}</span></div>
          <div className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4"><Thermometer className="text-sky-500" /><span className={`mt-3 block text-xs ${MUTED}`}>{c('setupSensors')}</span></div>
          <div className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4"><Flame className="text-orange-500" /><span className={`mt-3 block text-xs ${MUTED}`}>{c('setupCircuit')}</span></div>
        </div>
      </div>
    </section>

    <section className="space-y-4"><ClimateSectionHeading title={c('setupTitle')} detail={c('setupDetail')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]"><div className={`${PANEL} overflow-hidden`}>{steps.map((step, index) => <button key={step.title} type="button" onClick={() => setActiveStep(index)} aria-pressed={activeStep === index} className={`flex min-h-20 w-full items-center gap-3 border-b border-[color:var(--ui-separator)] px-4 py-3 text-left transition-colors last:border-b-0 ${activeStep === index ? 'bg-[color:var(--ui-fill-tertiary)]' : ''}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-xs font-semibold text-[color:var(--ui-text-primary)]">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-[color:var(--ui-text-primary)]">{c(step.title)}</strong><span className={`mt-0.5 block text-xs ${MUTED}`}>{c(step.detail)}</span></span><ArrowRight size={16} className={MUTED} aria-hidden="true" /></button>)}</div>
        <div className={`${PANEL} flex flex-col justify-center p-6`}><ClimateIcon icon={selected.icon} /><p className={`mt-5 text-xs font-semibold uppercase tracking-[0.15em] ${MUTED}`}>{String(activeStep + 1).padStart(2, '0')} / 05</p><h3 className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{c(selected.title)}</h3><p className={`mt-2 text-sm leading-6 ${MUTED}`}>{c(selected.detail)}</p><p className="mt-6 rounded-xl bg-[color:var(--ui-fill-tertiary)] p-3 text-xs text-[color:var(--ui-text-secondary)]">{c('future')}</p></div>
      </div>
    </section>

    <section className="space-y-4"><ClimateSectionHeading title={c('emptyStates')} detail={c('emptyHint')} /><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{missing.map(({ key, icon: Icon }) => <div key={key} className={`${PANEL} flex min-h-16 items-center gap-3 p-3`}><Icon size={18} className="text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /><span className="text-xs font-medium text-[color:var(--ui-text-primary)]">{c(key)}</span><CircleDashed size={15} className="ml-auto text-[color:var(--ui-text-tertiary)]" aria-hidden="true" /></div>)}</div></section>
  </div>;
}
