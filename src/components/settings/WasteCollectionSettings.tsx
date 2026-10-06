import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MockEntityStateMap } from '../../types/ha';
import GlassToggle from '../ui/GlassToggle';
import {
  getWasteCollectionConfig,
  getWasteCollectionPreview,
  saveWasteCollectionConfig,
  testWasteCollectionNotification,
  type WasteCollectionCallApi,
  type WasteCollectionDocument,
  type WasteCollectionPreview,
  type WasteException,
  type WasteFixedRule,
  type WasteMapping,
  type WasteSource,
  type WasteType,
} from '../../services/wasteCollectionClient';

type WasteCollectionSettingsProps = {
  callApi?: WasteCollectionCallApi;
  connected: boolean;
  canConfigure: boolean;
  haStates: MockEntityStateMap;
};

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function entityLabel(entityId: string, states: MockEntityStateMap) {
  const friendlyName = states[entityId]?.rawAttributes?.friendly_name;
  return typeof friendlyName === 'string' && friendlyName.trim()
    ? `${friendlyName.trim()} · ${entityId}`
    : entityId;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-content-surface rounded-[1.5rem] p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[color:var(--ui-text-primary)]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

const inputClass = 'ui-input min-h-10 w-full rounded-xl px-3 py-2 text-sm';
const secondaryButtonClass = 'liquid-glass-control inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40';

export default function WasteCollectionSettings({
  callApi,
  connected,
  canConfigure,
  haStates,
}: WasteCollectionSettingsProps) {
  const { locale, t } = useI18n();
  const [document, setDocument] = useState<WasteCollectionDocument | null>(null);
  const [preview, setPreview] = useState<WasteCollectionPreview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'testing' | 'error'>('loading');
  const [feedback, setFeedback] = useState('');

  const calendarEntities = useMemo(
    () => Object.keys(haStates)
      .filter((entityId) => entityId.startsWith('calendar.') && entityId !== 'calendar.domus_ui')
      .sort((first, second) => entityLabel(first, haStates).localeCompare(entityLabel(second, haStates))),
    [haStates],
  );
  const notifyEntities = useMemo(
    () => Object.keys(haStates).filter((entityId) => entityId.startsWith('notify.')).sort(),
    [haStates],
  );

  const refreshPreview = useCallback(async () => {
    if (!connected || !callApi) return;
    const result = await getWasteCollectionPreview(callApi, 7);
    setPreview(result);
  }, [callApi, connected]);

  useEffect(() => {
    let cancelled = false;
    if (!connected || !callApi) {
      setStatus('error');
      return () => { cancelled = true; };
    }
    setStatus('loading');
    setFeedback('');
    void getWasteCollectionConfig(callApi)
      .then(async (result) => {
        if (cancelled) return;
        setDocument(result);
        setStatus('ready');
        try {
          const nextPreview = await getWasteCollectionPreview(callApi, 7);
          if (!cancelled) setPreview(nextPreview);
        } catch {
          if (!cancelled) setPreview(null);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus('error');
        setFeedback(error instanceof Error ? error.message : t('waste.settings.error'));
      });
    return () => { cancelled = true; };
  }, [callApi, connected, t]);

  const updateDocument = (updater: (current: WasteCollectionDocument) => WasteCollectionDocument) => {
    if (!canConfigure) return;
    setDocument((current) => current ? updater(current) : current);
    setFeedback('');
  };

  const updateType = (typeId: string, patch: Partial<WasteType>) => updateDocument((current) => ({
    ...current,
    wasteTypes: current.wasteTypes.map((item) => item.id === typeId ? { ...item, ...patch } : item),
  }));

  const removeType = (typeId: string) => updateDocument((current) => ({
    ...current,
    wasteTypes: current.wasteTypes.filter((item) => item.id !== typeId),
    sources: current.sources.map((source) => ({
      ...source,
      rules: source.rules.filter((rule) => rule.wasteTypeId !== typeId),
    })),
    mappings: current.mappings.filter((mapping) => mapping.wasteTypeId !== typeId),
    exceptions: current.exceptions.filter((exception) => exception.wasteTypeId !== typeId),
  }));

  const updateSource = (sourceId: string, patch: Partial<WasteSource>) => updateDocument((current) => ({
    ...current,
    sources: current.sources.map((source) => source.id === sourceId ? { ...source, ...patch } : source),
  }));

  const removeSource = (sourceId: string) => updateDocument((current) => ({
    ...current,
    sources: current.sources.filter((source) => source.id !== sourceId),
    mappings: current.mappings.filter((mapping) => mapping.sourceId !== sourceId),
  }));

  const addFixedSource = () => updateDocument((current) => ({
    ...current,
    sources: [...current.sources, {
      id: createId('fixed'),
      kind: 'fixed',
      name: t('waste.sources.fixed'),
      enabled: true,
      entityIds: [],
      rules: [],
    }],
  }));

  const addCalendarSource = () => {
    if (calendarEntities.length === 0) return;
    const entityId = calendarEntities.find(
      (candidate) => !document?.sources.some((source) => source.entityIds.includes(candidate)),
    ) ?? calendarEntities[0];
    updateDocument((current) => ({
      ...current,
      sources: [...current.sources, {
        id: createId('calendar'),
        kind: 'calendar',
        name: entityLabel(entityId, haStates).split(' · ')[0],
        enabled: true,
        entityIds: [entityId],
        rules: [],
      }],
    }));
  };

  const addRule = (sourceId: string) => updateDocument((current) => {
    const firstType = current.wasteTypes[0];
    if (!firstType) return current;
    const rule: WasteFixedRule = {
      id: createId('rule'),
      wasteTypeId: firstType.id,
      enabled: true,
      weekdays: ['mon'],
      intervalWeeks: 1,
      anchorDate: todayIso(),
      startDate: '',
      endDate: '',
    };
    return {
      ...current,
      sources: current.sources.map((source) => source.id === sourceId
        ? { ...source, rules: [...source.rules, rule] }
        : source),
    };
  });

  const updateRule = (sourceId: string, ruleId: string, patch: Partial<WasteFixedRule>) => updateDocument((current) => ({
    ...current,
    sources: current.sources.map((source) => source.id === sourceId ? {
      ...source,
      rules: source.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
    } : source),
  }));

  const removeRule = (sourceId: string, ruleId: string) => updateDocument((current) => ({
    ...current,
    sources: current.sources.map((source) => source.id === sourceId
      ? { ...source, rules: source.rules.filter((rule) => rule.id !== ruleId) }
      : source),
  }));

  const addMapping = () => updateDocument((current) => {
    const source = current.sources.find((item) => item.kind === 'calendar');
    const wasteType = current.wasteTypes[0];
    if (!source || !wasteType) return current;
    const mapping: WasteMapping = {
      id: createId('mapping'),
      sourceId: source.id,
      match: '',
      wasteTypeId: wasteType.id,
    };
    return { ...current, mappings: [...current.mappings, mapping] };
  });

  const updateMapping = (mappingId: string, patch: Partial<WasteMapping>) => updateDocument((current) => ({
    ...current,
    mappings: current.mappings.map((mapping) => mapping.id === mappingId ? { ...mapping, ...patch } : mapping),
  }));

  const addException = () => updateDocument((current) => {
    const wasteType = current.wasteTypes[0];
    if (!wasteType) return current;
    const exception: WasteException = {
      id: createId('exception'),
      date: todayIso(),
      wasteTypeId: wasteType.id,
      action: 'skip',
    };
    return { ...current, exceptions: [...current.exceptions, exception] };
  });

  const updateException = (exceptionId: string, patch: Partial<WasteException>) => updateDocument((current) => ({
    ...current,
    exceptions: current.exceptions.map((exception) => exception.id === exceptionId ? { ...exception, ...patch } : exception),
  }));

  const handleSave = async () => {
    if (!document || !callApi || !canConfigure) return;
    setStatus('saving');
    setFeedback('');
    try {
      const saved = await saveWasteCollectionConfig(callApi, document);
      setDocument(saved);
      setStatus('ready');
      setFeedback(t('waste.settings.saved'));
      await refreshPreview();
    } catch (error) {
      setStatus('error');
      setFeedback(error instanceof Error ? error.message : t('waste.settings.error'));
    }
  };

  const handleTest = async () => {
    if (!callApi || !canConfigure) return;
    setStatus('testing');
    setFeedback('');
    try {
      const result = await testWasteCollectionNotification(callApi);
      if (result.failed.length > 0) {
        throw new Error(result.failed.map((item) => `${item.target}: ${item.error}`).join(' · '));
      }
      setStatus('ready');
      setFeedback(t('waste.notifications.testSent'));
    } catch (error) {
      setStatus('error');
      setFeedback(error instanceof Error ? error.message : t('waste.settings.error'));
    }
  };

  if (!connected || !callApi) {
    return <div className="dashboard-content-surface rounded-[1.5rem] p-5 text-sm text-[color:var(--ui-text-secondary)]">{t('waste.settings.unavailable')}</div>;
  }
  if (status === 'loading' || !document) {
    return <div className="dashboard-content-surface rounded-[1.5rem] p-5 text-sm text-[color:var(--ui-text-secondary)]">{t('waste.settings.loading')}</div>;
  }

  const calendarSources = document.sources.filter((source) => source.kind === 'calendar');
  const isBusy = status === 'saving' || status === 'testing';

  return (
    <div className="space-y-4 sm:space-y-5">
      {!canConfigure ? (
        <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{t('waste.settings.readOnly')}</p>
      ) : null}

      <Section title={t('waste.types.title')} description={t('waste.types.description')}>
        {document.wasteTypes.map((wasteType) => (
          <div key={wasteType.id} className="grid gap-2 rounded-2xl bg-[color:var(--ui-fill-tertiary)] p-3 sm:grid-cols-[1fr_7rem_1.25fr_auto] sm:items-end">
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('waste.types.name')}
              <input disabled={!canConfigure} className={`${inputClass} mt-1`} value={wasteType.name} onChange={(event) => updateType(wasteType.id, { name: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('waste.types.color')}
              <input disabled={!canConfigure} type="color" className="ui-input mt-1 h-10 w-full rounded-xl p-1" value={wasteType.color} onChange={(event) => updateType(wasteType.id, { color: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('waste.types.aliases')}
              <input disabled={!canConfigure} className={`${inputClass} mt-1`} value={wasteType.aliases.join(', ')} onChange={(event) => updateType(wasteType.id, { aliases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
            </label>
            <button type="button" disabled={!canConfigure || document.wasteTypes.length <= 1} onClick={() => removeType(wasteType.id)} className="glass-icon-button h-10 w-10 text-rose-300 disabled:opacity-35" aria-label={`${t('waste.common.remove')} ${wasteType.name}`}><Trash2 size={16} /></button>
          </div>
        ))}
        <button type="button" disabled={!canConfigure} onClick={() => updateDocument((current) => ({
          ...current,
          wasteTypes: [...current.wasteTypes, {
            id: createId('type'), name: `${t('waste.types.title')} ${current.wasteTypes.length + 1}`,
            icon: 'mdi:trash-can-outline', color: '#64748b', aliases: [],
          }],
        }))} className={secondaryButtonClass}><Plus size={15} />{t('waste.types.add')}</button>
      </Section>

      <Section title={t('waste.sources.title')} description={t('waste.sources.description')}>
        {document.sources.map((source) => (
          <div key={source.id} className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3.5">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {t('waste.sources.name')}
                <input disabled={!canConfigure} className={`${inputClass} mt-1`} value={source.name} onChange={(event) => updateSource(source.id, { name: event.target.value })} />
              </label>
              {source.kind === 'calendar' ? (
                <label className="min-w-56 flex-[1.4] text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                  {t('waste.sources.entity')}
                  <select disabled={!canConfigure} className={`${inputClass} mt-1`} value={source.entityIds[0] ?? ''} onChange={(event) => updateSource(source.id, { entityIds: [event.target.value] })}>
                    {calendarEntities.map((entityId) => <option key={entityId} value={entityId}>{entityLabel(entityId, haStates)}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                <GlassToggle checked={source.enabled} onChange={(enabled) => updateSource(source.id, { enabled })} label={`${t('waste.sources.enabled')} · ${source.name}`} disabled={!canConfigure} />
                {t('waste.sources.enabled')}
              </label>
              <button type="button" disabled={!canConfigure} onClick={() => removeSource(source.id)} className="glass-icon-button h-10 w-10 text-rose-300 disabled:opacity-35" aria-label={`${t('waste.common.remove')} ${source.name}`}><Trash2 size={16} /></button>
            </div>

            {source.kind === 'fixed' ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{t('waste.rules.title')}</h3>
                  <button type="button" disabled={!canConfigure} onClick={() => addRule(source.id)} className={secondaryButtonClass}><Plus size={14} />{t('waste.rules.add')}</button>
                </div>
                {source.rules.map((rule) => (
                  <div key={rule.id} className="rounded-xl bg-[color:var(--ui-surface-glass)] p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_9rem_11rem_auto] sm:items-end">
                      <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.rules.type')}
                        <select disabled={!canConfigure} className={`${inputClass} mt-1`} value={rule.wasteTypeId} onChange={(event) => updateRule(source.id, rule.id, { wasteTypeId: event.target.value })}>
                          {document.wasteTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.rules.interval')}
                        <input disabled={!canConfigure} type="number" min={1} max={52} className={`${inputClass} mt-1`} value={rule.intervalWeeks} onChange={(event) => updateRule(source.id, rule.id, { intervalWeeks: Number(event.target.value) })} />
                      </label>
                      <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.rules.anchor')}
                        <input disabled={!canConfigure} type="date" className={`${inputClass} mt-1`} value={rule.anchorDate} onChange={(event) => updateRule(source.id, rule.id, { anchorDate: event.target.value })} />
                      </label>
                      <button type="button" disabled={!canConfigure} onClick={() => removeRule(source.id, rule.id)} className="glass-icon-button h-10 w-10 text-rose-300 disabled:opacity-35" aria-label={t('waste.common.remove')}><Trash2 size={15} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('waste.rules.weekdays')}>
                      {WEEKDAYS.map((day) => {
                        const selected = rule.weekdays.includes(day);
                        return <button key={day} type="button" disabled={!canConfigure} aria-pressed={selected} onClick={() => updateRule(source.id, rule.id, { weekdays: selected ? rule.weekdays.filter((item) => item !== day) : [...rule.weekdays, day] })} className={`min-h-8 rounded-full px-3 text-[11px] font-semibold ${selected ? 'bg-[color:var(--ui-accent)] text-white' : 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'}`}>{t(`waste.weekday.${day}`)}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canConfigure} onClick={addFixedSource} className={secondaryButtonClass}><CalendarDays size={15} />{t('waste.sources.addFixed')}</button>
          <button type="button" disabled={!canConfigure || calendarEntities.length === 0} onClick={addCalendarSource} className={secondaryButtonClass}><Plus size={15} />{t('waste.sources.addCalendar')}</button>
          {calendarEntities.length === 0 ? <span className="self-center text-xs text-[color:var(--ui-text-tertiary)]">{t('waste.sources.noCalendars')}</span> : null}
        </div>
      </Section>

      <Section title={t('waste.mappings.title')} description={t('waste.mappings.description')}>
        {document.mappings.map((mapping) => (
          <div key={mapping.id} className="grid gap-2 rounded-2xl bg-[color:var(--ui-fill-tertiary)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.common.source')}
              <select disabled={!canConfigure} className={`${inputClass} mt-1`} value={mapping.sourceId} onChange={(event) => updateMapping(mapping.id, { sourceId: event.target.value })}>{calendarSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
            </label>
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.mappings.match')}
              <input disabled={!canConfigure} className={`${inputClass} mt-1`} value={mapping.match} onChange={(event) => updateMapping(mapping.id, { match: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.rules.type')}
              <select disabled={!canConfigure} className={`${inputClass} mt-1`} value={mapping.wasteTypeId} onChange={(event) => updateMapping(mapping.id, { wasteTypeId: event.target.value })}>{document.wasteTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </label>
            <button type="button" disabled={!canConfigure} onClick={() => updateDocument((current) => ({ ...current, mappings: current.mappings.filter((item) => item.id !== mapping.id) }))} className="glass-icon-button h-10 w-10 text-rose-300 disabled:opacity-35" aria-label={t('waste.common.remove')}><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" disabled={!canConfigure || calendarSources.length === 0} onClick={addMapping} className={secondaryButtonClass}><Plus size={15} />{t('waste.mappings.add')}</button>
      </Section>

      <Section title={t('waste.exceptions.title')} description={t('waste.exceptions.description')}>
        {document.exceptions.map((exception) => (
          <div key={exception.id} className="grid gap-2 rounded-2xl bg-[color:var(--ui-fill-tertiary)] p-3 sm:grid-cols-[11rem_1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.common.date')}<input disabled={!canConfigure} type="date" className={`${inputClass} mt-1`} value={exception.date} onChange={(event) => updateException(exception.id, { date: event.target.value })} /></label>
            <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.rules.type')}<select disabled={!canConfigure} className={`${inputClass} mt-1`} value={exception.wasteTypeId} onChange={(event) => updateException(exception.id, { wasteTypeId: event.target.value })}>{document.wasteTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <select disabled={!canConfigure} aria-label={t('waste.exceptions.title')} className={inputClass} value={exception.action} onChange={(event) => updateException(exception.id, { action: event.target.value as WasteException['action'] })}><option value="skip">{t('waste.exceptions.action.skip')}</option><option value="add">{t('waste.exceptions.action.add')}</option></select>
            <button type="button" disabled={!canConfigure} onClick={() => updateDocument((current) => ({ ...current, exceptions: current.exceptions.filter((item) => item.id !== exception.id) }))} className="glass-icon-button h-10 w-10 text-rose-300 disabled:opacity-35" aria-label={t('waste.common.remove')}><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" disabled={!canConfigure} onClick={addException} className={secondaryButtonClass}><Plus size={15} />{t('waste.exceptions.add')}</button>
      </Section>

      <Section title={t('waste.notifications.title')} description={t('waste.notifications.description')}>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-4 text-sm font-semibold">
            <span className="flex items-center gap-2"><BellRing size={17} />{t('waste.notifications.enabled')}</span>
            <GlassToggle checked={document.notifications.enabled} onChange={(enabled) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, enabled } }))} label={t('waste.notifications.enabled')} disabled={!canConfigure} />
          </label>
          <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.notifications.time')}<input disabled={!canConfigure || !document.notifications.enabled} type="time" className={`${inputClass} mt-1`} value={document.notifications.time} onChange={(event) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, time: event.target.value } }))} /></label>
        </div>
        <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('waste.notifications.targets')}
          <input disabled={!canConfigure} list="waste-notify-targets" className={`${inputClass} mt-1`} value={document.notifications.targets.join(', ')} onChange={(event) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, targets: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } }))} placeholder="notify.mobile_app_telefono" />
          <span className="mt-1 block font-normal text-[color:var(--ui-text-tertiary)]">{t('waste.notifications.targetsHint')}</span>
        </label>
        <datalist id="waste-notify-targets">{notifyEntities.map((entityId) => <option key={entityId} value={entityId} />)}</datalist>
        <button type="button" disabled={!canConfigure || isBusy || document.notifications.targets.length === 0} onClick={() => void handleTest()} className={secondaryButtonClass}><Send size={15} />{status === 'testing' ? t('waste.notifications.testing') : t('waste.notifications.test')}</button>
      </Section>

      <Section title={t('waste.preview.title')} description={t('waste.notifications.description')}>
        {preview?.warnings.length ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} />{t('waste.preview.warning')}</p>
            {preview.warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
          </div>
        ) : null}
        {preview && preview.events.length > 0 ? (
          <div className="space-y-2">
            {preview.events.map((event) => {
              const eventDate = new Date(`${event.start.slice(0, 10)}T12:00:00`);
              return (
                <div key={event.uid} className="flex items-center gap-3 rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-4 py-3">
                  <CalendarDays size={17} className="shrink-0 text-[color:var(--ui-accent)]" />
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{event.summary}</p><p className="text-[11px] text-[color:var(--ui-text-secondary)]">{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(eventDate)}</p></div>
                </div>
              );
            })}
          </div>
        ) : <p className="rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-4 py-5 text-center text-sm text-[color:var(--ui-text-secondary)]">{t('waste.preview.empty')}</p>}
        <button type="button" disabled={isBusy} onClick={() => void refreshPreview().catch((error) => setFeedback(error instanceof Error ? error.message : t('waste.settings.error')))} className={secondaryButtonClass}><RefreshCw size={15} />{t('waste.preview.refresh')}</button>
      </Section>

      {feedback ? <p role="status" className={`rounded-2xl px-4 py-3 text-xs ${status === 'error' ? 'border border-rose-400/20 bg-rose-500/10 text-rose-100' : 'bg-emerald-500/10 text-emerald-200'}`}>{feedback}</p> : null}

      {canConfigure ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-10 flex justify-end">
          <button type="button" disabled={isBusy} onClick={() => void handleSave()} className="liquid-glass-selection inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-xl disabled:opacity-50"><Save size={17} />{status === 'saving' ? t('waste.settings.saving') : t('waste.settings.save')}</button>
        </div>
      ) : null}
    </div>
  );
}
