import { useEffect, useState } from 'react';
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { saveClimateConfig, type ClimateCallApi, type ClimateConfigResponse } from '../../services/climateConfigClient';
import type { ClimateHouseConfig, ClimateWeekday } from './climateModel';
import { copyWeeklyDay, createProfile, deleteProfile, deleteWeeklyEvent, profileInUse, putWeeklyEvent, WEEKDAYS } from './climateProgramsDraft';
import { MUTED, PANEL } from './ClimatePrimitives';

const copy = {
  it: { title: 'Programmazione Climate', description: 'Profili e settimana della casa. Il programma non cambia ancora il target attuale.', profiles: 'Profili', first: 'Crea il tuo primo profilo', newName: 'Nome nuovo profilo', create: 'Crea profilo', name: 'Nome profilo', targets: 'Target delle zone', noTarget: 'Nessun target', delete: 'Elimina profilo', inUse: 'Profilo usato nel programma: rimuovi prima i suoi eventi.', week: 'Settimana', workdays: 'Lun–Ven', weekend: 'Sab–Dom', days: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'], grouped: 'I nuovi eventi saranno aggiunti a tutti i giorni selezionati. Per modificare un evento, scegli un giorno.', empty: 'Nessuna programmazione', add: 'Aggiungi fascia', time: 'Ora', profile: 'Profilo', edit: 'Modifica', apply: 'Applica', remove: 'Elimina', copy: 'Copia giorno', copyFrom: 'Copia da', copyTo: 'Su questi giorni', save: 'Salva programmazione', cancel: 'Annulla modifiche', dirty: 'Modifiche non salvate', readonly: 'Solo un amministratore può modificare profili e programma.', duplicate: 'A quest’ora esiste già un evento nel giorno selezionato.', invalid: 'Controlla nome, ora e target (5–40 °C).', conflict: 'La configurazione è cambiata. Ricarica prima di salvare.', denied: 'Non hai il permesso di modificare la programmazione.', network: 'Salvataggio non riuscito.', reload: 'Ricarica', noProfiles: 'Crea un profilo prima di aggiungere fasce.' },
  en: { title: 'Climate schedule', description: 'House profiles and week. The schedule does not change the current target yet.', profiles: 'Profiles', first: 'Create your first profile', newName: 'New profile name', create: 'Create profile', name: 'Profile name', targets: 'Zone targets', noTarget: 'No target', delete: 'Delete profile', inUse: 'This profile is used by the schedule. Remove its events first.', week: 'Week', workdays: 'Mon–Fri', weekend: 'Sat–Sun', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], grouped: 'New events are added to every selected day. Select one day to edit an event.', empty: 'No schedule', add: 'Add time slot', time: 'Time', profile: 'Profile', edit: 'Edit', apply: 'Apply', remove: 'Delete', copy: 'Copy day', copyFrom: 'Copy from', copyTo: 'To these days', save: 'Save schedule', cancel: 'Discard changes', dirty: 'Unsaved changes', readonly: 'Only an administrator can edit profiles and schedules.', duplicate: 'An event already exists at that time on a selected day.', invalid: 'Check name, time and targets (5–40 °C).', conflict: 'Configuration changed. Reload before saving.', denied: 'You cannot edit the schedule.', network: 'Could not save.', reload: 'Reload', noProfiles: 'Create a profile before adding time slots.' },
  fr: { title: 'Programme Climat', description: 'Profils et semaine de la maison. Le programme ne change pas encore la consigne actuelle.', profiles: 'Profils', first: 'Créez votre premier profil', newName: 'Nom du nouveau profil', create: 'Créer un profil', name: 'Nom du profil', targets: 'Consignes des zones', noTarget: 'Aucune consigne', delete: 'Supprimer le profil', inUse: 'Ce profil est utilisé par le programme. Supprimez d’abord ses événements.', week: 'Semaine', workdays: 'Lun–Ven', weekend: 'Sam–Dim', days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], grouped: 'Les événements sont ajoutés à tous les jours sélectionnés. Choisissez un seul jour pour modifier.', empty: 'Aucun programme', add: 'Ajouter un créneau', time: 'Heure', profile: 'Profil', edit: 'Modifier', apply: 'Appliquer', remove: 'Supprimer', copy: 'Copier le jour', copyFrom: 'Copier depuis', copyTo: 'Vers ces jours', save: 'Enregistrer le programme', cancel: 'Annuler les changements', dirty: 'Modifications non enregistrées', readonly: 'Seul un administrateur peut modifier les profils et programmes.', duplicate: 'Un événement existe déjà à cette heure pour un jour choisi.', invalid: 'Vérifiez le nom, l’heure et les consignes (5–40 °C).', conflict: 'La configuration a changé. Rechargez avant d’enregistrer.', denied: 'Vous ne pouvez pas modifier le programme.', network: 'Enregistrement impossible.', reload: 'Recharger', noProfiles: 'Créez un profil avant d’ajouter des créneaux.' },
  hu: { title: 'Klímaütemezés', description: 'Otthoni profilok és a hét. Az ütemezés egyelőre nem változtatja meg az aktuális célértéket.', profiles: 'Profilok', first: 'Hozd létre az első profilodat', newName: 'Új profil neve', create: 'Profil létrehozása', name: 'Profil neve', targets: 'Zónák célértékei', noTarget: 'Nincs célérték', delete: 'Profil törlése', inUse: 'Ezt a profilt az ütemezés használja. Előbb távolítsd el az eseményeit.', week: 'Hét', workdays: 'H–P', weekend: 'Szo–V', days: ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'], grouped: 'Az új események minden kiválasztott naphoz hozzáadódnak. Egy esemény szerkesztéséhez válassz ki egy napot.', empty: 'Nincs ütemezés', add: 'Idősáv hozzáadása', time: 'Idő', profile: 'Profil', edit: 'Szerkesztés', apply: 'Alkalmaz', remove: 'Törlés', copy: 'Nap másolása', copyFrom: 'Másolás innen', copyTo: 'Ezekre a napokra', save: 'Ütemezés mentése', cancel: 'Módosítások elvetése', dirty: 'Nem mentett módosítások', readonly: 'A profilokat és ütemezéseket csak rendszergazda szerkesztheti.', duplicate: 'Egy kiválasztott napon már van esemény ebben az időpontban.', invalid: 'Ellenőrizd a nevet, az időt és a célértékeket (5–40 °C).', conflict: 'A beállítás megváltozott. Mentés előtt töltsd újra.', denied: 'Az ütemezést nem szerkesztheted.', network: 'Nem sikerült menteni.', reload: 'Újratöltés', noProfiles: 'Idősávok hozzáadása előtt hozz létre egy profilt.' },
} as const;

const FIELD = 'liquid-glass-control min-h-11 rounded-xl px-3 text-sm';

function errorText(error: unknown, t: typeof copy.it): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  if (code === 'profile_in_use') return t.inUse;
  if (code === 'duplicate_schedule_time') return t.duplicate;
  if (code === 'conflict') return t.conflict;
  if (code === 'access_denied') return t.denied;
  if (code.startsWith('invalid_') || code === 'unknown_profile' || code === 'duplicate_profile_id' || code === 'too_many_events' || code === 'unknown_zone_or_profile') return t.invalid;
  return t.network;
}

export function ClimateProgramsEditor({ config, revision, callApi, canManage, onSaved, onReload, onDirtyChange }: {
  config: ClimateHouseConfig; revision: number; callApi: ClimateCallApi; canManage: boolean;
  onSaved: (response: ClimateConfigResponse) => void; onReload: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const { locale } = useI18n();
  const t = copy[locale] as typeof copy.it;
  const [draft, setDraft] = useState<ClimateHouseConfig>(() => structuredClone(config));
  const [selectedProfileId, setSelectedProfileId] = useState(config.profiles[0]?.id ?? '');
  const [newName, setNewName] = useState('');
  const [days, setDays] = useState<ClimateWeekday[]>(['monday']);
  const [time, setTime] = useState('06:30');
  const [eventProfileId, setEventProfileId] = useState(config.profiles[0]?.id ?? '');
  const [editingTime, setEditingTime] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<ClimateWeekday>('monday');
  const [copyDestinations, setCopyDestinations] = useState<ClimateWeekday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([draft.profiles, draft.schedules]) !== JSON.stringify([config.profiles, config.schedules]);
  const selected = draft.profiles.find((item) => item.id === selectedProfileId);
  const primaryDay = days[0];
  const events = draft.schedules.find((item) => item.day === primaryDay)?.events ?? [];
  const invalid = draft.profiles.some((profile) => !profile.name.trim() || profile.name.length > 100 || Object.values(profile.zoneTargets).some((target) => !Number.isFinite(target) || target < 5 || target > 40));
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = t.dirty; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, t.dirty]);
  const update = (change: (current: ClimateHouseConfig) => ClimateHouseConfig) => {
    try { setDraft(change(draft)); setError(null); return true; }
    catch (failure) { setError(errorText(failure, t)); return false; }
  };
  const create = () => {
    try { const next = createProfile(draft, newName); setDraft(next); setSelectedProfileId(next.profiles.at(-1)!.id); setEventProfileId(next.profiles.at(-1)!.id); setNewName(''); setError(null); }
    catch (failure) { setError(errorText(failure, t)); }
  };
  const save = async () => {
    if (!canManage || invalid || !dirty) { if (invalid) setError(t.invalid); return; }
    setBusy(true); setError(null);
    try { onSaved(await saveClimateConfig(callApi, draft, revision)); }
    catch (failure) { setError(errorText(failure, t)); }
    finally { setBusy(false); }
  };
  const add = () => update((current) => putWeeklyEvent(current, days, null, { time, profileId: eventProfileId }));
  const startEdit = (event: { time: string; profileId: string }) => { setEditingTime(event.time); setTime(event.time); setEventProfileId(event.profileId); };
  const applyEdit = () => { if (editingTime && update((current) => putWeeklyEvent(current, [primaryDay], editingTime, { time, profileId: eventProfileId }))) setEditingTime(null); };
  const selectDays = (next: ClimateWeekday[]) => { setDays(next); setEditingTime(null); };
  const cancel = () => { setDraft(structuredClone(config)); setSelectedProfileId(config.profiles[0]?.id ?? ''); setError(null); setEditingTime(null); };

  return <div className="space-y-5 pb-24" data-climate-programs="true">
    <header className={`${PANEL} flex flex-wrap items-center justify-between gap-3 p-5`}><div><div className="flex items-center gap-2"><CalendarDays size={20} aria-hidden="true" /><h3 className="text-lg font-semibold">{t.title}</h3></div><p className={`mt-1 text-sm ${MUTED}`}>{t.description}</p></div>{!canManage && <p className={`text-xs ${MUTED}`}>{t.readonly}</p>}</header>
    {error && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{error}{error === t.conflict && <button type="button" onClick={onReload} className="ml-3 underline">{t.reload}</button>}</div>}
    <section className={`${PANEL} space-y-4 p-4 sm:p-5`}><h4 className="font-semibold">{t.profiles}</h4>
      {draft.profiles.length === 0 && <p className={`text-sm ${MUTED}`}>{t.first}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">{draft.profiles.map((profile) => <button key={profile.id} type="button" onClick={() => setSelectedProfileId(profile.id)} aria-pressed={selectedProfileId === profile.id} className={`${FIELD} shrink-0 ${selectedProfileId === profile.id ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{profile.name || t.name}</button>)}</div>
      {canManage && <div className="flex flex-wrap gap-2"><label className="min-w-48 flex-1 text-xs">{t.newName}<input value={newName} onChange={(event) => setNewName(event.target.value)} className={`${FIELD} mt-1 w-full`} maxLength={100} /></label><button type="button" onClick={create} disabled={!newName.trim() || busy} className={`${FIELD} self-end font-semibold`}><Plus size={15} className="mr-1 inline" />{t.create}</button></div>}
      {selected && <div className="space-y-4 border-t border-current/10 pt-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-xs">{t.name}<input value={selected.name} disabled={!canManage || busy} onChange={(event) => { const name = event.target.value; update((current) => { const next = structuredClone(current); next.profiles.find((item) => item.id === selected.id)!.name = name; return next; }); }} className={`${FIELD} mt-1 w-full`} maxLength={100} /></label>{canManage && <button type="button" onClick={() => { try { setDraft(deleteProfile(draft, selected.id)); setSelectedProfileId(draft.profiles.find((item) => item.id !== selected.id)?.id ?? ''); setError(null); } catch (failure) { setError(errorText(failure, t)); } }} disabled={busy} className={`${FIELD} text-[color:var(--ui-danger)]`}><Trash2 size={15} className="mr-1 inline" />{t.delete}</button>}</div>
        {profileInUse(draft, selected.id) && <p className={`text-xs ${MUTED}`}>{t.inUse}</p>}
        <h5 className="text-sm font-semibold">{t.targets}</h5><div className="grid gap-3 sm:grid-cols-2">{draft.zones.map((zone) => <label key={zone.id} className="text-xs"><span className="block font-medium">{zone.name}</span><input type="number" min="5" max="40" step="0.5" value={selected.zoneTargets[zone.id] ?? ''} placeholder={t.noTarget} disabled={!canManage || busy} onChange={(event) => { const raw = event.target.value; update((current) => { const next = structuredClone(current); const targets = next.profiles.find((item) => item.id === selected.id)!.zoneTargets; if (raw === '') delete targets[zone.id]; else targets[zone.id] = Number(raw); return next; }); }} className={`${FIELD} mt-1 w-full`} /></label>)}</div>
      </div>}
    </section>
    <section className={`${PANEL} space-y-4 p-4 sm:p-5`}><h4 className="font-semibold">{t.week}</h4>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => selectDays(WEEKDAYS.slice(0, 5))} className={`${FIELD} ${days.length === 5 ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{t.workdays}</button><button type="button" onClick={() => selectDays(WEEKDAYS.slice(5))} className={`${FIELD} ${days.length === 2 ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{t.weekend}</button></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{WEEKDAYS.map((day, index) => <button key={day} type="button" onClick={() => selectDays([day])} aria-pressed={days.length === 1 && primaryDay === day} className={`${FIELD} min-w-11 shrink-0 px-2 ${days.includes(day) ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}>{t.days[index]}</button>)}</div>
      {days.length > 1 && <p className={`text-xs ${MUTED}`}>{t.grouped}</p>}
      {events.length === 0 ? <p className={`text-sm ${MUTED}`}>{t.empty}</p> : <ol className="space-y-2">{events.map((event) => <li key={event.time} className="liquid-glass-control flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm"><strong className="tabular-nums">{event.time}</strong><span className="min-w-0 flex-1">{draft.profiles.find((item) => item.id === event.profileId)?.name ?? event.profileId}</span>{canManage && days.length === 1 && <><button type="button" onClick={() => startEdit(event)} className="min-h-10 px-2 underline">{t.edit}</button><button type="button" onClick={() => update((current) => deleteWeeklyEvent(current, primaryDay, event.time))} className="min-h-10 px-2 text-[color:var(--ui-danger)]">{t.remove}</button></>}</li>)}</ol>}
      {canManage && <div className="flex flex-wrap items-end gap-2 border-t border-current/10 pt-4"><label className="text-xs">{t.time}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={`${FIELD} mt-1 block`} /></label><label className="min-w-40 flex-1 text-xs">{t.profile}<select value={eventProfileId} onChange={(event) => setEventProfileId(event.target.value)} className={`${FIELD} mt-1 block w-full`}>{draft.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><button type="button" onClick={editingTime ? applyEdit : add} disabled={!draft.profiles.length || busy} className={`${FIELD} font-semibold`}>{editingTime ? t.apply : t.add}</button>{editingTime && <button type="button" onClick={() => setEditingTime(null)} className={FIELD}>{t.cancel}</button>}</div>}
      {canManage && !draft.profiles.length && <p className={`text-xs ${MUTED}`}>{t.noProfiles}</p>}
      {canManage && <div className="space-y-2 border-t border-current/10 pt-4"><h5 className="text-sm font-semibold"><Copy size={15} className="mr-1 inline" />{t.copy}</h5><label className="block text-xs">{t.copyFrom}<select value={copySource} onChange={(event) => setCopySource(event.target.value as ClimateWeekday)} className={`${FIELD} ml-2`}>{WEEKDAYS.map((day, index) => <option key={day} value={day}>{t.days[index]}</option>)}</select></label><p className={`text-xs ${MUTED}`}>{t.copyTo}</p><div className="flex flex-wrap gap-2">{WEEKDAYS.filter((day) => day !== copySource).map((day) => <label key={day} className={`${FIELD} flex items-center gap-2`}><input type="checkbox" checked={copyDestinations.includes(day)} onChange={(event) => setCopyDestinations((current) => event.target.checked ? [...current, day] : current.filter((item) => item !== day))} />{t.days[WEEKDAYS.indexOf(day)]}</label>)}</div><button type="button" disabled={!copyDestinations.length || busy} onClick={() => update((current) => copyWeeklyDay(current, copySource, copyDestinations))} className={`${FIELD} font-semibold`}>{t.copy}</button></div>}
    </section>
    {canManage && <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-bg-grouped)] p-3 shadow-xl backdrop-blur-2xl"><span className={`text-xs font-semibold ${MUTED}`}>{dirty ? t.dirty : t.title}</span><div className="flex gap-2"><button type="button" onClick={cancel} disabled={!dirty || busy} className={`${FIELD} font-semibold`}>{t.cancel}</button><button type="button" onClick={save} disabled={!dirty || invalid || busy} className={`${FIELD} bg-[color:var(--ui-accent)] font-semibold text-white disabled:opacity-50`}>{t.save}</button></div></div>}
  </div>;
}
