import { useEffect, useState } from 'react';
import { Flame, Snowflake, Thermometer, TriangleAlert } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MockEntityStateMap } from '../../types/ha';
import type { ClimateHouseConfig, ClimateOperatingMode, ClimateControlMode, ClimateZoneMode } from './climateModel';
import { clearZoneOverride, climateObservedKey, getClimateState, setHouseIntent, setZoneIntent, setZoneOverride, type ClimateAutoResolution, type ClimateExecutionPreview, type ClimateOverrideExpiryMode, type ClimateStateResponse, type ClimateZoneState } from '../../services/climateStateClient';
import type { ClimateCallApi } from '../../services/climateConfigClient';
import { MUTED, PANEL } from './ClimatePrimitives';
import '../../components/devices/theme/devices.css';

const words = {
  it: { title: 'Intent e stato Climate', detail: 'Stato osservato e decisione prevista. Nessun comando viene inviato ai dispositivi.', mode: 'Modalità casa', zoneMode: 'Modalità zona', control: 'Controllo', manual: 'Manuale', auto: 'Automatico', heating: 'Riscaldamento', cooling: 'Raffrescamento', off: 'Spento', follow: 'Segue la casa', target: 'Target ambiente', current: 'Temperatura attuale', save: 'Applica', reload: 'Ricarica', unavailable: 'Stato Climate non disponibile.', pending: 'Automatico non configurato', unknown: 'Sensore o target non disponibile', satisfied: 'Temperatura soddisfatta', needs_heating: 'Richiede riscaldamento', needs_cooling: 'Richiede raffrescamento', candidates: 'Percorsi compatibili', noCandidates: 'Nessun terminale compatibile disponibile', constraint: 'Vincolo umidità presente; sicurezza raffrescamento non valutata', mismatch: 'Target dispositivo diverso; causa sconosciuta', conflict: 'La configurazione è cambiata. Ricarica prima di riprovare.', active: 'Profilo attivo', next: 'Prossimo cambio', scheduled: 'Da programma', noTarget: 'Nessun target nel profilo', sensorMissing: 'Sensore temperatura non disponibile', timezoneMissing: 'Timezone della casa non disponibile', scheduleInvalid: 'Programma non valido', temporary: 'Temporaneo', plannedTarget: 'Target programmato', program: 'Programma', untilNext: 'Fino al prossimo cambio', for30: 'Per 30 minuti', for60: 'Per 1 ora', for120: 'Per 2 ore', untilTime: 'Fino alle…', until: 'Fino alle', clearOverride: 'Annulla modifica temporanea', applyOverride: 'Applica temporaneamente', expiry: 'Scadenza', invalidTarget: 'Inserisci un target tra 5° e 40°' },
  en: { title: 'Climate intent and state', detail: 'Observed state and decision preview. No device commands are sent.', mode: 'House mode', zoneMode: 'Zone mode', control: 'Control', manual: 'Manual', auto: 'Automatic', heating: 'Heating', cooling: 'Cooling', off: 'Off', follow: 'Follow house', target: 'Room target', current: 'Current temperature', save: 'Apply', reload: 'Reload', unavailable: 'Climate state unavailable.', pending: 'Automatic schedule not configured', unknown: 'Sensor or target unavailable', satisfied: 'Temperature satisfied', needs_heating: 'Needs heating', needs_cooling: 'Needs cooling', candidates: 'Compatible paths', noCandidates: 'No compatible terminal available', constraint: 'Humidity constraint present; cooling safety not evaluated', mismatch: 'Device target differs; cause unknown', conflict: 'State changed. Reload before retrying.', active: 'Active profile', next: 'Next change', scheduled: 'From schedule', noTarget: 'No target in profile', sensorMissing: 'Temperature sensor unavailable', timezoneMissing: 'House timezone unavailable', scheduleInvalid: 'Invalid schedule', temporary: 'Temporary', plannedTarget: 'Scheduled target', program: 'Schedule', untilNext: 'Until next change', for30: 'For 30 minutes', for60: 'For 1 hour', for120: 'For 2 hours', untilTime: 'Until…', until: 'Until', clearOverride: 'Cancel temporary change', applyOverride: 'Apply temporarily', expiry: 'Expiry', invalidTarget: 'Enter a target from 5° to 40°' },
  fr: { title: 'Intention et état Climat', detail: 'État observé et aperçu de décision. Aucune commande envoyée aux appareils.', mode: 'Mode maison', zoneMode: 'Mode de zone', control: 'Contrôle', manual: 'Manuel', auto: 'Automatique', heating: 'Chauffage', cooling: 'Rafraîchissement', off: 'Arrêt', follow: 'Suit la maison', target: 'Consigne pièce', current: 'Température actuelle', save: 'Appliquer', reload: 'Recharger', unavailable: 'État Climat indisponible.', pending: 'Programme automatique non configuré', unknown: 'Capteur ou consigne indisponible', satisfied: 'Température atteinte', needs_heating: 'Chauffage requis', needs_cooling: 'Rafraîchissement requis', candidates: 'Parcours compatibles', noCandidates: 'Aucun terminal compatible disponible', constraint: 'Contrainte humidité présente ; sécurité non évaluée', mismatch: 'Consigne appareil différente ; cause inconnue', conflict: 'État modifié. Rechargez avant de réessayer.', active: 'Profil actif', next: 'Prochain changement', scheduled: 'Selon le programme', noTarget: 'Aucune consigne dans le profil', sensorMissing: 'Capteur de température indisponible', timezoneMissing: 'Fuseau horaire de la maison indisponible', scheduleInvalid: 'Programme invalide', temporary: 'Temporaire', plannedTarget: 'Consigne programmée', program: 'Programme', untilNext: 'Jusqu’au prochain changement', for30: 'Pendant 30 minutes', for60: 'Pendant 1 heure', for120: 'Pendant 2 heures', untilTime: 'Jusqu’à…', until: 'Jusqu’à', clearOverride: 'Annuler la modification temporaire', applyOverride: 'Appliquer temporairement', expiry: 'Expiration', invalidTarget: 'Saisissez une consigne de 5° à 40°' },
} as const;

type OverrideChoice = 'next_schedule_event' | 'duration_30' | 'duration_60' | 'duration_120' | 'until_time';

function ExecutionPreview({ value, config }: { value: ClimateExecutionPreview; config: ClimateHouseConfig }) {
  const { locale } = useI18n();
  const it = locale === 'it';
  const reasonLabels: Record<string, string> = it ? {
    delivery_strategy_required: 'Più sistemi compatibili per questa zona.',
    no_compatible_terminal: 'Nessun sistema compatibile per questa zona.',
    no_target: 'Manca un target ambiente.',
    sensor_invalid: 'Temperatura ambiente non disponibile.',
    sensor_unit_unknown: 'Unità del sensore non riconosciuta.',
    endpoint_unavailable: 'Dispositivo non disponibile.',
    house_off: 'Clima della casa spento.',
    zone_off: 'Zona spenta.',
  } : {
    delivery_strategy_required: 'Multiple compatible systems for this zone.',
    no_compatible_terminal: 'No compatible system for this zone.',
    no_target: 'Room target is missing.',
    sensor_invalid: 'Room temperature unavailable.',
    sensor_unit_unknown: 'Sensor unit is unknown.',
    endpoint_unavailable: 'Device unavailable.',
    house_off: 'House climate is off.',
    zone_off: 'Zone is off.',
  };
  return <section className={`${PANEL} p-4 sm:p-5`} data-climate-execution-preview="true">
    <h3 className="text-base font-semibold">{it ? 'Anteprima controllo supervisore' : 'Supervisory control preview'}</h3>
    <p className={`mt-1 text-xs ${MUTED}`}>{it ? 'Piano tecnico. Nessun comando viene inviato ai dispositivi.' : 'Technical plan. No device commands are sent.'}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{value.plans.map((plan) => <article key={plan.zoneId} className="rounded-2xl border border-[color:var(--ui-border)] p-3 text-sm">
      <strong>{config.zones.find((zone) => zone.id === plan.zoneId)?.name ?? plan.zoneId}</strong>
      <p className={`mt-1 text-xs ${MUTED}`}>{plan.status === 'blocked' || plan.status === 'unresolved' ? (it ? 'Controllo automatico non disponibile' : 'Automatic control unavailable') : plan.status === 'noop' ? (it ? 'Stato già allineato' : 'Already aligned') : (it ? 'Piano simbolico disponibile' : 'Symbolic plan available')}</p>
      {plan.reasons[0] && reasonLabels[plan.reasons[0]] && <p className="mt-1 text-xs">{reasonLabels[plan.reasons[0]]}</p>}
      {plan.desired && <p className="mt-2">{it ? 'Desiderato' : 'Desired'}: {plan.desired.hvacMode} · {plan.desired.targetTemperature} {plan.desired.temperatureUnit}</p>}
      {plan.observed && <p>{it ? 'Osservato' : 'Observed'}: {plan.observed.hvacMode} · {plan.observed.targetTemperature ?? '—'} {plan.observed.temperatureUnit}</p>}
      {plan.actions.length > 0 && <p className="mt-2 text-xs">{it ? 'Azioni previste' : 'Planned actions'}: {plan.actions.map((action) => `${action.kind} ${action.value}`).join(' → ')}</p>}
      <details className="mt-2 text-xs"><summary>{it ? 'Dettagli tecnici' : 'Technical details'}</summary><p>endpoint: {plan.endpointId ?? '—'} · status: {plan.status}</p><p>reason: {plan.reasons.join(', ') || '—'}</p><p>physical: {plan.physicalExecutionAllowed ? 'allowed' : 'blocked'}</p></details>
    </article>)}</div>
  </section>;
}

function OverrideControls({ state, resolution, canControl, busy, onCreate, onClear }: {
  state: ClimateZoneState; resolution: ClimateAutoResolution | null | undefined; canControl: boolean; busy: boolean;
  onCreate: (target: number, mode: ClimateOverrideExpiryMode, options: { durationMinutes?: number; untilTime?: string }) => void;
  onClear: () => void;
}) {
  const { locale } = useI18n();
  const t = words[locale];
  const nextAvailable = Boolean(resolution?.nextEvent);
  const [target, setTarget] = useState(state.derived.effectiveTarget?.toString() ?? '');
  const [choice, setChoice] = useState<OverrideChoice>(nextAvailable ? 'next_schedule_event' : 'duration_60');
  const [untilTime, setUntilTime] = useState('');
  useEffect(() => setTarget(state.derived.effectiveTarget?.toString() ?? ''), [state.derived.effectiveTarget]);
  useEffect(() => { if (!nextAvailable && choice === 'next_schedule_event') setChoice('duration_60'); }, [nextAvailable, choice]);
  const validTarget = target !== '' && Number.isFinite(Number(target)) && Number(target) >= 5 && Number(target) <= 40;
  const activeOverride = state.override;
  const expiryLabel = activeOverride?.expiresAtLocalTime ? `${activeOverride.expiresAtLocalTime}${activeOverride.expiresAtLocalDate ? ` · ${activeOverride.expiresAtLocalDate}` : ''}` : activeOverride?.expiresAt ?? '';
  const submit = () => {
    if (!validTarget) return;
    if (choice === 'next_schedule_event') onCreate(Number(target), 'next_schedule_event', {});
    else if (choice === 'until_time') onCreate(Number(target), 'until_time', { untilTime });
    else onCreate(Number(target), 'duration', { durationMinutes: Number(choice.split('_')[1]) });
  };
  return <div className="mt-3 space-y-3 border-t border-current/10 pt-3 text-xs">
    <p>{t.plannedTarget}: {state.derived.scheduledTarget === null || state.derived.scheduledTarget === undefined ? '—' : `${state.derived.scheduledTarget.toFixed(1)}°`}</p>
    {activeOverride && <div className="space-y-1"><p className="font-semibold">{t.temporary} · {activeOverride.targetTemperature.toFixed(1)}°</p><p>{activeOverride.expiryMode === 'next_schedule_event' ? `${t.untilNext} · ${expiryLabel}` : `${t.until} ${expiryLabel}`}</p>{state.derived.scheduledTarget !== null && state.derived.scheduledTarget !== undefined && <p>{t.program}: {resolution?.activeProfileName ?? ''} · {state.derived.scheduledTarget.toFixed(1)}°</p>}{canControl && <button type="button" disabled={busy} onClick={onClear} className="liquid-glass-control min-h-11 rounded-xl px-3 text-xs font-semibold">{t.clearOverride}</button>}</div>}
    {canControl && <div className="flex flex-wrap items-end gap-2"><label>{t.target}<input type="number" min="5" max="40" step="0.5" value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)} className="liquid-glass-control mt-1 block min-h-11 w-24 rounded-xl px-2 text-sm" /></label><label>{t.expiry}<select value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value as OverrideChoice)} className="liquid-glass-control mt-1 block min-h-11 rounded-xl px-2 text-sm">{nextAvailable && <option value="next_schedule_event">{t.untilNext}</option>}<option value="duration_30">{t.for30}</option><option value="duration_60">{t.for60}</option><option value="duration_120">{t.for120}</option><option value="until_time">{t.untilTime}</option></select></label>{choice === 'until_time' && <label>{t.untilTime}<input type="time" value={untilTime} disabled={busy} onChange={(event) => setUntilTime(event.target.value)} className="liquid-glass-control mt-1 block min-h-11 rounded-xl px-2 text-sm" /></label>}<button type="button" disabled={busy || !validTarget || (choice === 'until_time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(untilTime))} onClick={submit} className="liquid-glass-control min-h-11 rounded-xl px-3 text-xs font-semibold">{t.applyOverride}</button></div>}
    {canControl && target !== '' && !validTarget && <p role="alert">{t.invalidTarget}</p>}
  </div>;
}

function ZoneCard({ zone, config, state, controlMode, activeProfileName, autoResolution, canControl, busy, onWrite, onCreateOverride, onClearOverride }: { zone: ClimateHouseConfig['zones'][number]; config: ClimateHouseConfig; state: ClimateZoneState; controlMode: ClimateControlMode; activeProfileName: string | null; autoResolution: ClimateAutoResolution | null | undefined; canControl: boolean; busy: boolean; onWrite: (mode: ClimateZoneMode, target: number | null) => void; onCreateOverride: (target: number, mode: ClimateOverrideExpiryMode, options: { durationMinutes?: number; untilTime?: string }) => void; onClearOverride: () => void }) {
  const { locale } = useI18n();
  const t = words[locale];
  const [draftTarget, setDraftTarget] = useState(state.intent.targetTemperature?.toString() ?? '');
  useEffect(() => setDraftTarget(state.intent.targetTemperature?.toString() ?? ''), [state.intent.targetTemperature]);
  const status = state.derived.thermalStatus;
  const active = status === 'needs_heating' || status === 'needs_cooling';
  const tone = status === 'needs_cooling' ? 'cool' : status === 'needs_heating' ? 'heat' : 'auto';
  const Icon = status === 'unknown' ? TriangleAlert : status === 'needs_cooling' ? Snowflake : status === 'needs_heating' ? Flame : Thermometer;
  const label = status === 'off' ? t.off : status === 'unknown' ? state.derived.thermalReason === 'no_target' ? `${t.noTarget} ${activeProfileName ?? ''}` : state.derived.thermalReason === 'sensor_unavailable' ? t.sensorMissing : t.unknown : status === 'satisfied' ? t.satisfied : t[status];
  return <article className={`dv-tile dv-climate dv-cl-${tone} ${active ? 'is-lit-climate' : status === 'unknown' ? 'is-unavailable' : 'is-on'} !h-full min-h-[208px] w-full p-4 text-left`}>
    <div className="dv-climate-top flex w-full items-center gap-3"><span className="dv-icon-button" aria-hidden="true"><Icon size={21} /></span><div><strong className="block text-[15px] font-semibold">{zone.name}</strong><span className="text-[13px]">{label}</span></div></div>
    <div className="dv-climate-mid mt-4 flex w-full justify-between gap-3"><div><span className="block text-xs">{t.current}</span><strong className="text-4xl tabular-nums">{state.observed.temperature === null ? '—' : `${state.observed.temperature.toFixed(1)}°`}</strong></div><div className="dv-climate-room"><b>{state.derived.effectiveTarget === null ? '—' : `${state.derived.effectiveTarget.toFixed(1)}°`}</b><span>{t.target}</span></div></div>
    {state.derived.targetSource === 'schedule' && <p className="mt-3 text-xs">{t.scheduled}</p>}
    {state.derived.autoPendingConfiguration && state.derived.targetReason === 'no_schedule' && <p className="mt-3 text-xs">{t.pending}</p>}
    <div className="dv-climate-foot mt-3 w-full border-t border-current/10 pt-2 text-xs"><span>{t.candidates}: {state.derived.compatiblePaths.length ? state.derived.compatiblePaths.map((path) => config.endpoints.find((item) => item.id === path.terminalId)?.name ?? path.terminalId).join(', ') : t.noCandidates}</span></div>
    {state.derived.compatiblePaths.some((path) => path.humidityConstraintPresent) && <p className="mt-2 text-xs">{t.constraint}</p>}
    {state.derived.terminals.some((terminal) => terminal.targetMismatch) && <p className="mt-2 text-xs">{t.mismatch}</p>}
    {controlMode === 'auto' && <OverrideControls state={state} resolution={autoResolution} canControl={canControl} busy={busy} onCreate={onCreateOverride} onClear={onClearOverride} />}
    {canControl && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-current/10 pt-3"><label className="text-xs">{t.zoneMode}<select value={state.intent.mode} disabled={busy} onChange={(event) => onWrite(event.target.value as ClimateZoneMode, state.intent.targetTemperature)} className="liquid-glass-control mt-1 block min-h-10 rounded-xl px-2 text-sm"><option value="follow_house">{t.follow}</option><option value="off">{t.off}</option></select></label>{controlMode === 'manual' && <><label className="text-xs">{t.target}<input type="number" min="5" max="40" step="0.5" value={draftTarget} disabled={busy} onChange={(event) => setDraftTarget(event.target.value)} className="liquid-glass-control mt-1 block min-h-10 w-24 rounded-xl px-2 text-sm" /></label><button type="button" disabled={busy || (draftTarget !== '' && (!Number.isFinite(Number(draftTarget)) || Number(draftTarget) < 5 || Number(draftTarget) > 40))} onClick={() => onWrite(state.intent.mode, draftTarget === '' ? null : Number(draftTarget))} className="liquid-glass-control min-h-10 rounded-xl px-3 text-xs font-semibold">{t.save}</button></>}</div>}
  </article>;
}

export function ClimateRuntimePanel({ config, callApi, states, canControl }: { config: ClimateHouseConfig; callApi: ClimateCallApi; states: MockEntityStateMap; canControl: boolean }) {
  const { locale } = useI18n();
  const t = words[locale];
  const [response, setResponse] = useState<ClimateStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const observedKey = climateObservedKey(config, states);
  useEffect(() => {
    let active = true;
    getClimateState(callApi).then((value) => { if (active) { setResponse(value); setError(null); } }).catch(() => { if (active) setError(t.unavailable); });
    return () => { active = false; };
  }, [callApi, observedKey, reload, t.unavailable]);
  const write = async (request: (revision: number) => Promise<ClimateStateResponse>) => {
    if (!response || busy || !canControl || !['absent', 'ready'].includes(response.state)) return;
    setBusy(true);
    try { setResponse(await request(response.revision)); setError(null); }
    catch { setError(t.conflict); }
    finally { setBusy(false); }
  };
  const preview = response?.preview;
  return <section className="space-y-4" data-climate-runtime="true"><div className={`${PANEL} flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5`}><div><h3 className="text-lg font-semibold">{t.title}</h3><p className={`mt-1 text-xs ${MUTED}`}>{t.detail}</p></div><button type="button" onClick={() => setReload((count) => count + 1)} className="liquid-glass-control min-h-10 rounded-full px-4 text-xs">{t.reload}</button></div>
    {error && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{error}</p>}
    {preview ? <><div className={`${PANEL} flex flex-wrap gap-4 p-4`}><label className="text-xs font-semibold">{t.mode}<select value={preview.house.operatingMode} disabled={!canControl || busy || !['absent', 'ready'].includes(response?.state ?? '')} onChange={(event) => write((revision) => setHouseIntent(callApi, event.target.value as ClimateOperatingMode, preview.house.controlMode, revision))} className="liquid-glass-control mt-1 block min-h-11 rounded-xl px-3 text-sm"><option value="off">{t.off}</option><option value="heating">{t.heating}</option><option value="cooling">{t.cooling}</option></select></label><label className="text-xs font-semibold">{t.control}<select value={preview.house.controlMode} disabled={!canControl || busy || !['absent', 'ready'].includes(response?.state ?? '')} onChange={(event) => write((revision) => setHouseIntent(callApi, preview.house.operatingMode, event.target.value as ClimateControlMode, revision))} className="liquid-glass-control mt-1 block min-h-11 rounded-xl px-3 text-sm"><option value="manual">{t.manual}</option><option value="auto">{t.auto}</option></select></label></div>
      {preview.house.controlMode === 'auto' && preview.autoResolution?.status === 'resolved' && <div className={`${PANEL} flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm`}><span>{t.active}: <strong>{preview.autoResolution.activeProfileName}</strong></span>{preview.autoResolution.nextEvent && <span>{t.next}: <strong>{preview.autoResolution.nextEvent.time} · {preview.autoResolution.nextEvent.profileName ?? preview.autoResolution.nextEvent.profileId}</strong></span>}</div>}
      {preview.house.controlMode === 'auto' && preview.autoResolution?.status !== 'resolved' && <p className={`${PANEL} p-4 text-sm`}>{preview.autoResolution?.status === 'timezone_unavailable' ? t.timezoneMissing : preview.autoResolution?.status === 'no_schedule' || !preview.autoResolution ? t.pending : t.scheduleInvalid}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{preview.zones.map((zoneState) => { const zone = config.zones.find((item) => item.id === zoneState.zoneId); return zone ? <ZoneCard key={zone.id} zone={zone} config={config} state={zoneState} controlMode={preview.house.controlMode} activeProfileName={preview.autoResolution?.activeProfileName ?? null} autoResolution={preview.autoResolution} canControl={canControl && ['absent', 'ready'].includes(response?.state ?? '')} busy={busy} onWrite={(mode, target) => write((revision) => setZoneIntent(callApi, zone.id, mode, target, revision))} onCreateOverride={(target, mode, options) => write((revision) => setZoneOverride(callApi, zone.id, target, mode, revision, options))} onClearOverride={() => write((revision) => clearZoneOverride(callApi, zone.id, revision))} /> : null; })}</div></> : !error && <p className={`${PANEL} p-4 text-sm`}>{t.unavailable}</p>}
    {response?.executionPreview && <ExecutionPreview value={response.executionPreview} config={config} />}
  </section>;
}
