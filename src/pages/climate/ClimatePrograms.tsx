import { useState } from 'react';
import { CalendarDays, Clock3, Plus, Trash2 } from 'lucide-react';
import { GlassSegmentSelect } from '../../components/ui/GlassSegmentSelect';
import GlassButton from '../../components/ui/GlassButton';
import { DEMO_CLIMATE_SYSTEM } from './climatePreviewData';
import { useClimateCopy, type ClimateCopyKey } from './climateCopy';
import { ClimateIcon, ClimateSectionHeading, MUTED, PANEL } from './ClimatePrimitives';
import { ZONE_NAME_KEY } from './ClimateZoneCard';

type Block = { id: number; time: string; profileId: string };
const initialWeekday: Block[] = [
  { id: 1, time: '06:30', profileId: 'comfort' }, { id: 2, time: '08:30', profileId: 'eco' },
  { id: 3, time: '17:00', profileId: 'comfort' }, { id: 4, time: '23:30', profileId: 'night' },
];
const initialWeekend: Block[] = [
  { id: 5, time: '08:00', profileId: 'comfort' }, { id: 6, time: '23:30', profileId: 'night' },
];

export function ClimatePrograms() {
  const { c, temperature } = useClimateCopy();
  const [dayGroup, setDayGroup] = useState<'weekdays' | 'weekend'>('weekdays');
  const [blocks, setBlocks] = useState({ weekdays: initialWeekday, weekend: initialWeekend });
  const [profiles, setProfiles] = useState(DEMO_CLIMATE_SYSTEM.profiles.map((profile) => ({ id: profile.id, name: c(profile.id as ClimateCopyKey), target: profile.roomTarget.celsius })));
  const [profileName, setProfileName] = useState('');
  const [profileTarget, setProfileTarget] = useState(20);
  const updateBlock = (id: number, change: Partial<Block>) => setBlocks((current) => ({ ...current, [dayGroup]: current[dayGroup].map((block) => block.id === id ? { ...block, ...change } : block) }));
  const removeBlock = (id: number) => setBlocks((current) => ({ ...current, [dayGroup]: current[dayGroup].filter((block) => block.id !== id) }));
  const addBlock = () => setBlocks((current) => ({ ...current, [dayGroup]: [...current[dayGroup], { id: Date.now(), time: '12:00', profileId: profiles[0]?.id ?? 'comfort' }].sort((a, b) => a.time.localeCompare(b.time)) }));
  const addProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    setProfiles((current) => [...current, { id: `preview-${Date.now()}`, name, target: profileTarget }]);
    setProfileName('');
  };
  const profileNameFor = (id: string) => profiles.find((profile) => profile.id === id)?.name ?? id;

  return <div className="space-y-8">
    <section className="space-y-4"><ClimateSectionHeading eyebrow={c('programs')} title={c('scheduleTitle')} detail={c('scheduleDetail')} />
      <div className={`${PANEL} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><GlassSegmentSelect<'weekdays' | 'weekend'> ariaLabel={c('scheduleTitle')} value={dayGroup} onChange={setDayGroup} options={[{ value: 'weekdays', label: c('weekdays') }, { value: 'weekend', label: c('weekend') }]} className="w-full sm:w-auto" /><span className={`text-xs ${MUTED}`}>{c('localDraft')}</span></div>
        <div className="space-y-2">{blocks[dayGroup].map((block) => <div key={block.id} className="flex min-h-16 flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-2 sm:flex-nowrap">
          <Clock3 size={18} className={`ml-2 shrink-0 ${MUTED}`} aria-hidden="true" />
          <label className="sr-only" htmlFor={`time-${block.id}`}>{c('time')}</label><input id={`time-${block.id}`} type="time" value={block.time} onChange={(event) => updateBlock(block.id, { time: event.target.value })} className="liquid-glass-control min-h-11 rounded-xl px-2 text-sm font-semibold tabular-nums" />
          <label className="sr-only" htmlFor={`profile-${block.id}`}>{c('profile')}</label><select id={`profile-${block.id}`} value={block.profileId} onChange={(event) => updateBlock(block.id, { profileId: event.target.value })} className="liquid-glass-control min-h-11 min-w-28 flex-1 rounded-xl px-3 text-sm font-medium">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>
          <button type="button" onClick={() => removeBlock(block.id)} aria-label={`${c('removeBlock')} ${block.time}`} className="liquid-glass-control flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><Trash2 size={17} /></button>
        </div>)}</div>
        <GlassButton onClick={addBlock} className="flex items-center gap-2"><Plus size={17} />{c('addBlock')}</GlassButton>
      </div>
    </section>

    <section className="space-y-4"><ClimateSectionHeading title={c('profileTitle')} detail={c('profileDetail')} />
      <div className="grid gap-3 sm:grid-cols-2">{profiles.map((profile) => <article key={profile.id} className={`${PANEL} flex min-h-24 items-center gap-3 p-4`}><ClimateIcon icon={CalendarDays} tone="cool" /><div className="min-w-0 flex-1"><h3 className="font-semibold text-[color:var(--ui-text-primary)]">{profile.name}</h3><p className={`mt-1 text-xs ${MUTED}`}>{c('profileTarget')}</p></div><span className="text-lg font-semibold tabular-nums text-[color:var(--ui-text-primary)]">{temperature(profile.target)}</span></article>)}</div>
      {profiles.length === 0 && <p className={`${PANEL} p-5 text-sm ${MUTED}`}>{c('profileEmpty')}</p>}
      <div className={`${PANEL} space-y-3 p-4`}><h3 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{c('createProfile')}</h3>
        <div className="flex flex-wrap items-end gap-2"><label className={`flex min-w-40 flex-1 flex-col gap-1 text-xs ${MUTED}`}>{c('profileName')}<input type="text" maxLength={32} value={profileName} onChange={(event) => setProfileName(event.target.value)} className="liquid-glass-control min-h-11 rounded-xl px-3 text-sm text-[color:var(--ui-text-primary)]" /></label><label className={`flex w-28 flex-col gap-1 text-xs ${MUTED}`}>{c('roomTarget')}<input type="number" min="5" max="35" step="0.5" value={profileTarget} onChange={(event) => setProfileTarget(Number(event.target.value))} className="liquid-glass-control min-h-11 rounded-xl px-3 text-sm tabular-nums text-[color:var(--ui-text-primary)]" /></label><GlassButton onClick={addProfile} disabled={!profileName.trim()}>{c('addProfile')}</GlassButton></div>
      </div>
      <div className={`${PANEL} overflow-hidden`}><p className={`border-b border-[color:var(--ui-separator)] px-4 py-3 text-xs font-semibold ${MUTED}`}>{c('comfort')} · {c('roomTarget')}</p>{DEMO_CLIMATE_SYSTEM.zones.filter((zone) => zone.profileId === 'comfort').map((zone) => <div key={zone.id} className="flex items-center justify-between border-b border-[color:var(--ui-separator)] px-4 py-3 last:border-b-0"><span className="text-sm text-[color:var(--ui-text-primary)]">{c(ZONE_NAME_KEY[zone.id])}</span><strong className="text-sm tabular-nums text-[color:var(--ui-text-primary)]">{zone.target ? temperature(zone.target.celsius) : '—'}</strong></div>)}</div>
    </section>
  </div>;
}
