import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CalendarRange,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MockEntityStateMap } from '../../types/ha';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import GlassToggle from '../ui/GlassToggle';
import { nextSevenDays, WeekDayStrip, type WeekDayBadge } from '../ui/WeekDayStrip';
import { resolveWasteTypeIcon, WASTE_TYPE_ICONS, WasteTypeBadge } from '../waste/wasteTypeIcons';
import {
  getWasteCollectionConfig,
  getWasteCollectionPreview,
  saveWasteCollectionConfig,
  testWasteCollectionNotification,
  WASTE_CALENDAR_UID_PREFIX,
  type WasteCollectionCallApi,
  type WasteCollectionDocument,
  type WasteCollectionPreview,
  type WasteException,
  type WasteFixedRule,
  type WasteSource,
  type WasteType,
} from '../../services/wasteCollectionClient';

type WasteCollectionSettingsProps = {
  callApi?: WasteCollectionCallApi;
  connected: boolean;
  canConfigure: boolean;
  haStates: MockEntityStateMap;
  onDirtyChange?: (dirty: boolean) => void;
};

type PendingUndo = {
  message: string;
  snapshot: WasteCollectionDocument;
  wasDirty: boolean;
};

type NotifyTargetOption = {
  id: string;
  label: string;
  detail?: string;
};

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const INTERVAL_CHOICES = [1, 2, 3, 4];
const UNDO_TIMEOUT_MS = 6000;
const TYPE_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#14b8a6', '#64748b', '#f97316', '#a855f7', '#ef4444', '#ec4899', '#84cc16'];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDay(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function todayIso() {
  return isoDay(new Date());
}

function nextWeekdayIso(weekdays: string[]) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  for (let offset = 0; offset < 7; offset += 1) {
    if (weekdays.includes(WEEKDAYS[(date.getDay() + 6) % 7])) return isoDay(date);
    date.setDate(date.getDate() + 1);
  }
  return todayIso();
}

// Older configurations linked calendar titles per source; the page now keeps a
// single list of other names per waste type, so those titles become aliases.
function foldMappingsIntoAliases(document: WasteCollectionDocument): WasteCollectionDocument {
  if (document.mappings.length === 0) return document;
  const wasteTypes = document.wasteTypes.map((wasteType) => {
    const known = new Set([wasteType.name, ...wasteType.aliases].map((item) => item.trim().toLocaleLowerCase()));
    const aliases = [...wasteType.aliases];
    for (const mapping of document.mappings) {
      const match = mapping.match.trim();
      if (mapping.wasteTypeId !== wasteType.id || !match || known.has(match.toLocaleLowerCase())) continue;
      known.add(match.toLocaleLowerCase());
      aliases.push(match);
    }
    return { ...wasteType, aliases };
  });
  return { ...document, wasteTypes, mappings: [] };
}

function friendlyName(entityId: string, states: MockEntityStateMap) {
  const name = states[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId;
}

function humanizeService(service: string) {
  const words = service.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : service;
}

function notifyServiceNames(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];
  const notify = (payload as Record<string, unknown>).notify;
  if (!notify || typeof notify !== 'object') return [];
  return Object.keys(notify).filter((service) => service !== 'send_message' && /^[a-z0-9_]+$/.test(service));
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ColorSwatch({
  color,
  label,
  disabled,
  onChange,
}: {
  color: string;
  label: string;
  disabled: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <label
      className="relative block h-10 w-10 shrink-0 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_4px_14px_rgba(0,0,0,0.22)] focus-within:ring-2 focus-within:ring-[color:var(--ui-focus-ring)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
      style={{ backgroundColor: color }}
    >
      <input
        type="color"
        disabled={disabled}
        aria-label={label}
        value={color}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}

const inputClass = 'ui-input min-h-10 w-full min-w-0 rounded-xl px-3 py-2 text-sm';
const fieldLabelClass = 'text-xs font-semibold text-[color:var(--ui-text-secondary)]';
const secondaryButtonClass = 'liquid-glass-control inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40';
const removeButtonClass = 'glass-icon-button h-10 w-10 shrink-0 text-[color:var(--ui-danger)] disabled:opacity-35';
const rowClass = 'rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3';
const dividerClass = 'border-t border-[color:var(--ui-border)] pt-3';
const footerRowClass = 'flex items-center gap-3 py-2 pl-4 pr-2 text-sm';
const chipOffClass = 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]';

export default function WasteCollectionSettings({
  callApi,
  connected,
  canConfigure,
  haStates,
  onDirtyChange,
}: WasteCollectionSettingsProps) {
  const { locale, t } = useI18n();
  const [document, setDocument] = useState<WasteCollectionDocument | null>(null);
  const [preview, setPreview] = useState<WasteCollectionPreview | null>(null);
  const [notifyServices, setNotifyServices] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'testing' | 'error'>('loading');
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [iconPickerTypeId, setIconPickerTypeId] = useState<string | null>(null);

  const calendarEntities = useMemo(
    () => Object.keys(haStates)
      .filter((entityId) => entityId.startsWith('calendar.') && entityId !== 'calendar.domus_ui')
      .sort((first, second) => friendlyName(first, haStates).localeCompare(friendlyName(second, haStates))),
    [haStates],
  );

  const weekdayNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    // 1 January 2024 is a Monday, so index 0 lines up with WEEKDAYS[0].
    return Object.fromEntries(WEEKDAYS.map((day, index) => [day, formatter.format(new Date(2024, 0, 1 + index))]));
  }, [locale]);

  const notifyOptions = useMemo<NotifyTargetOption[]>(() => {
    const options = new Map<string, NotifyTargetOption>();
    for (const entityId of Object.keys(haStates).filter((item) => item.startsWith('notify.')).sort()) {
      options.set(entityId, { id: entityId, label: friendlyName(entityId, haStates) });
    }
    for (const service of [...notifyServices].sort()) {
      const id = `notify.${service}`;
      if (options.has(id)) continue;
      if (service === 'persistent_notification') {
        options.set(id, { id, label: t('waste.notifications.homeAssistant') });
      } else if (service.startsWith('mobile_app_')) {
        options.set(id, { id, label: humanizeService(service.slice('mobile_app_'.length)), detail: t('waste.notifications.app') });
      } else {
        options.set(id, { id, label: humanizeService(service) });
      }
    }
    for (const target of document?.notifications.targets ?? []) {
      if (!options.has(target)) options.set(target, { id: target, label: target });
    }
    return [...options.values()];
  }, [document?.notifications.targets, haStates, notifyServices, t]);

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
        setDocument(foldMappingsIntoAliases(result));
        setDirty(false);
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
    void callApi<unknown>({ type: 'get_services' }, { reportError: false })
      .then((payload) => {
        if (!cancelled) setNotifyServices(notifyServiceNames(payload));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [callApi, connected, t]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!pendingUndo) return undefined;
    const timer = window.setTimeout(() => setPendingUndo(null), UNDO_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingUndo]);

  const updateDocument = (updater: (current: WasteCollectionDocument) => WasteCollectionDocument) => {
    if (!canConfigure) return;
    setDocument((current) => current ? updater(current) : current);
    setDirty(true);
    setFeedback('');
  };

  const removeWithUndo = (name: string, linked: number, updater: (current: WasteCollectionDocument) => WasteCollectionDocument) => {
    if (!document || !canConfigure) return;
    const message = linked === 0
      ? t('waste.undo.removed', { name })
      : t(linked === 1 ? 'waste.undo.removedLinkedOne' : 'waste.undo.removedLinkedMany', { name, count: linked });
    setPendingUndo({ message, snapshot: document, wasDirty: dirty });
    updateDocument(updater);
  };

  const undoRemoval = () => {
    if (!pendingUndo) return;
    setDocument(pendingUndo.snapshot);
    setDirty(pendingUndo.wasDirty);
    setPendingUndo(null);
  };

  const addType = () => updateDocument((current) => {
    const usedColors = new Set(current.wasteTypes.map((item) => item.color.toLowerCase()));
    return {
      ...current,
      wasteTypes: [...current.wasteTypes, {
        id: createId('type'),
        name: t('waste.types.newName'),
        icon: 'mdi:trash-can',
        color: TYPE_COLORS.find((color) => !usedColors.has(color)) ?? TYPE_COLORS[current.wasteTypes.length % TYPE_COLORS.length],
        aliases: [],
      }],
    };
  });

  const updateType = (typeId: string, patch: Partial<WasteType>) => updateDocument((current) => ({
    ...current,
    wasteTypes: current.wasteTypes.map((item) => item.id === typeId ? { ...item, ...patch } : item),
  }));

  const removeType = (wasteType: WasteType) => {
    const linked = (document?.sources.flatMap((source) => source.rules).filter((rule) => rule.wasteTypeId === wasteType.id).length ?? 0) +
      (document?.exceptions.filter((exception) => exception.wasteTypeId === wasteType.id).length ?? 0);
    removeWithUndo(wasteType.name, linked, (current) => ({
      ...current,
      wasteTypes: current.wasteTypes.filter((item) => item.id !== wasteType.id),
      sources: current.sources.map((source) => ({
        ...source,
        rules: source.rules.filter((rule) => rule.wasteTypeId !== wasteType.id),
      })),
      mappings: current.mappings.filter((mapping) => mapping.wasteTypeId !== wasteType.id),
      exceptions: current.exceptions.filter((exception) => exception.wasteTypeId !== wasteType.id),
    }));
  };

  const updateSource = (sourceId: string, patch: Partial<WasteSource>) => updateDocument((current) => ({
    ...current,
    sources: current.sources.map((source) => source.id === sourceId ? { ...source, ...patch } : source),
  }));

  const removeSource = (source: WasteSource, name: string) => removeWithUndo(name, source.rules.length, (current) => ({
    ...current,
    sources: current.sources.filter((item) => item.id !== source.id),
    mappings: current.mappings.filter((mapping) => mapping.sourceId !== source.id),
  }));

  const createRule = (current: WasteCollectionDocument): WasteFixedRule | null => {
    const usedTypes = new Set(current.sources.flatMap((source) => source.rules.map((rule) => rule.wasteTypeId)));
    const wasteType = current.wasteTypes.find((item) => !usedTypes.has(item.id)) ?? current.wasteTypes[0];
    if (!wasteType) return null;
    return {
      id: createId('rule'),
      wasteTypeId: wasteType.id,
      enabled: true,
      weekdays: ['mon'],
      intervalWeeks: 1,
      anchorDate: todayIso(),
      startDate: '',
      endDate: '',
    };
  };

  const addFixedSource = () => updateDocument((current) => {
    const rule = createRule(current);
    return {
      ...current,
      sources: [...current.sources, {
        id: createId('fixed'),
        kind: 'fixed',
        name: t('waste.sources.fixed'),
        enabled: true,
        entityIds: [],
        rules: rule ? [rule] : [],
      }],
    };
  });

  const addCalendarSource = () => {
    if (calendarEntities.length === 0) return;
    const entityId = calendarEntities.find(
      (candidate) => !document?.sources.some((source) => source.entityIds.includes(candidate)),
    );
    if (!entityId) return;
    updateDocument((current) => ({
      ...current,
      sources: [...current.sources, {
        id: createId('calendar'),
        kind: 'calendar',
        name: friendlyName(entityId, haStates),
        enabled: true,
        entityIds: [entityId],
        rules: [],
      }],
    }));
  };

  const addRule = (sourceId: string) => updateDocument((current) => {
    const rule = createRule(current);
    if (!rule) return current;
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

  const removeRule = (sourceId: string, ruleId: string, name: string) => removeWithUndo(name, 0, (current) => ({
    ...current,
    sources: current.sources.map((source) => source.id === sourceId
      ? { ...source, rules: source.rules.filter((rule) => rule.id !== ruleId) }
      : source),
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

  const toggleTarget = (target: string) => updateDocument((current) => {
    const targets = current.notifications.targets.includes(target)
      ? current.notifications.targets.filter((item) => item !== target)
      : [...current.notifications.targets, target];
    return { ...current, notifications: { ...current.notifications, targets } };
  });

  const handleSave = async () => {
    if (!document || !callApi || !canConfigure) return;
    setStatus('saving');
    setFeedback('');
    try {
      const saved = await saveWasteCollectionConfig(callApi, document);
      setDocument(foldMappingsIntoAliases(saved));
      setDirty(false);
      setPendingUndo(null);
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

  const isBusy = status === 'saving' || status === 'testing';
  const typeById = new Map(document.wasteTypes.map((item) => [item.id, item]));
  const typeOptions: GlassDropdownOption[] = document.wasteTypes.map((item) => ({ id: item.id, name: item.name }));
  const typeOption = (typeId: string) => typeOptions.find((option) => option.id === typeId) ?? null;
  const formatDays = (days: string[]) => {
    const names = WEEKDAYS.filter((day) => days.includes(day)).map((day) => weekdayNames[day]);
    try {
      return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
    } catch {
      return names.join(', ');
    }
  };
  const intervalLabel = (weeks: number) => weeks === 1 ? t('waste.rules.weekly') : t('waste.rules.everyWeeks', { count: weeks });

  const previewByDay = new Map<string, Array<{ uid: string; summary: string; color: string; icon?: string }>>();
  for (const event of preview?.events ?? []) {
    const day = event.start.slice(0, 10);
    const typeId = event.uid.startsWith(WASTE_CALENDAR_UID_PREFIX) ? event.uid.slice(WASTE_CALENDAR_UID_PREFIX.length).split(':')[0] : '';
    const entries = previewByDay.get(day) ?? [];
    const wasteType = typeById.get(typeId);
    entries.push({ uid: event.uid, summary: event.summary, color: wasteType?.color ?? 'var(--ui-text-tertiary)', icon: wasteType?.icon });
    previewByDay.set(day, entries);
  }
  const weekDays = nextSevenDays();
  const badgesByDay = new Map<string, WeekDayBadge[]>(
    [...previewByDay].map(([day, entries]) => [day, entries.map((entry) => ({ key: entry.uid, color: entry.color, Icon: resolveWasteTypeIcon(entry.icon) }))]),
  );
  const today = weekDays[0].iso;
  const tomorrow = weekDays[1].iso;
  const activeDay = selectedDay && weekDays.some((item) => item.iso === selectedDay)
    ? selectedDay
    : weekDays.find((item) => previewByDay.has(item.iso))?.iso ?? today;
  const activeEntries = previewByDay.get(activeDay) ?? [];
  const hasFixedSource = document.sources.some((source) => source.kind === 'fixed');
  const unusedCalendars = calendarEntities.filter((entityId) => !document.sources.some((source) => source.entityIds.includes(entityId)));
  const showCalendarTile = unusedCalendars.length > 0 || (calendarEntities.length === 0 && document.sources.length === 0);
  const dayLabel = (day: string) => {
    if (day === today) return t('waste.preview.today');
    if (day === tomorrow) return t('waste.preview.tomorrow');
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`));
  };

  const renderFixedSource = (source: WasteSource) => (
    <div className="mt-3 space-y-3">
      {source.rules.length === 0 ? <p className="text-xs leading-5 text-[color:var(--ui-text-tertiary)]">{t('waste.rules.empty')}</p> : null}
      {source.rules.map((rule) => {
        const wasteType = typeById.get(rule.wasteTypeId);
        const choices = INTERVAL_CHOICES.includes(rule.intervalWeeks) ? INTERVAL_CHOICES : [...INTERVAL_CHOICES, rule.intervalWeeks];
        return (
          <div key={rule.id} className={`space-y-3 ${dividerClass}`}>
            <div className="flex items-center gap-2">
              <WasteTypeBadge icon={wasteType?.icon} color={wasteType?.color ?? 'var(--ui-accent)'} size={28} />
              <GlassDropdown
                ariaLabel={t('waste.common.type')}
                options={typeOptions}
                selected={typeOption(rule.wasteTypeId)}
                onChange={(option) => updateRule(source.id, rule.id, { wasteTypeId: option.id })}
                disabled={!canConfigure}
                className="flex-1 sm:w-72 sm:flex-none"
                buttonClassName="min-h-10 font-semibold"
              />
              <button type="button" disabled={!canConfigure} onClick={() => removeRule(source.id, rule.id, wasteType?.name ?? t('waste.common.type'))} className={`${removeButtonClass} ml-auto`} aria-label={t('waste.rules.remove', { name: wasteType?.name ?? t('waste.common.type') })}><Trash2 size={15} /></button>
            </div>
            <div>
              <p className={fieldLabelClass}>{t('waste.rules.weekdays')}</p>
              <div className="mt-1.5 grid grid-cols-7 gap-1 sm:flex sm:flex-wrap sm:gap-1.5" role="group" aria-label={t('waste.rules.weekdays')}>
                {WEEKDAYS.map((day) => {
                  const selected = rule.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!canConfigure}
                      aria-pressed={selected}
                      aria-label={weekdayNames[day]}
                      onClick={() => updateRule(source.id, rule.id, { weekdays: selected ? rule.weekdays.filter((item) => item !== day) : [...rule.weekdays, day] })}
                      className={`min-h-9 rounded-full px-0 text-[11px] font-semibold transition-colors sm:w-14 sm:text-xs ${selected ? 'bg-[color:var(--ui-accent)] text-white' : chipOffClass}`}
                    >
                      {t(`waste.weekday.${day}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[16rem_16rem] sm:gap-3">
              <GlassDropdown
                label={t('waste.rules.frequency')}
                options={choices.map((weeks) => ({ id: String(weeks), name: intervalLabel(weeks) }))}
                selected={{ id: String(rule.intervalWeeks), name: intervalLabel(rule.intervalWeeks) }}
                onChange={(option) => {
                  const intervalWeeks = Number(option.id);
                  updateRule(source.id, rule.id, rule.intervalWeeks === 1 && intervalWeeks > 1
                    ? { intervalWeeks, anchorDate: nextWeekdayIso(rule.weekdays) }
                    : { intervalWeeks });
                }}
                disabled={!canConfigure}
                buttonClassName="min-h-10"
              />
              {rule.intervalWeeks > 1 ? (
                <div>
                  <label className={`block ${fieldLabelClass}`}>{t('waste.rules.anchor')}
                    <input disabled={!canConfigure} type="date" aria-describedby={`${rule.id}-anchor-hint`} className={`${inputClass} mt-1`} value={rule.anchorDate} onChange={(event) => updateRule(source.id, rule.id, { anchorDate: event.target.value })} />
                  </label>
                  <p id={`${rule.id}-anchor-hint`} className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">{t('waste.rules.anchorHint', { count: rule.intervalWeeks })}</p>
                </div>
              ) : null}
            </div>
            <p className={`text-xs ${rule.weekdays.length === 0 ? 'text-amber-200' : 'text-[color:var(--ui-text-secondary)]'}`}>
              {rule.weekdays.length === 0 ? t('waste.rules.noDays') : `${intervalLabel(rule.intervalWeeks)} · ${formatDays(rule.weekdays)}`}
            </p>
          </div>
        );
      })}
      <button type="button" disabled={!canConfigure || document.wasteTypes.length === 0} onClick={() => addRule(source.id)} className={secondaryButtonClass}><Plus size={14} />{t('waste.rules.add')}</button>
    </div>
  );

  const renderCalendarSource = (source: WasteSource) => {
    const entityId = source.entityIds[0] ?? '';
    const options = entityId && !calendarEntities.includes(entityId) ? [entityId, ...calendarEntities] : calendarEntities;
    return (
      <div className="mt-3 space-y-3">
        <GlassDropdown
          label={t('waste.sources.entity')}
          options={options.map((item) => ({ id: item, name: friendlyName(item, haStates) }))}
          selected={entityId ? { id: entityId, name: friendlyName(entityId, haStates) } : null}
          onChange={(option) => updateSource(source.id, { entityIds: [option.id], name: option.name })}
          disabled={!canConfigure}
          className="sm:max-w-md"
          buttonClassName="min-h-10"
        />
        <p className="text-xs leading-5 text-[color:var(--ui-text-secondary)]">{t('waste.sources.calendarMatchHint')}</p>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-2 sm:space-y-10">
      {!canConfigure ? (
        <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{t('waste.settings.readOnly')}</p>
      ) : null}

      <Section
        title={t('waste.preview.title')}
        description={dirty ? t('waste.preview.stale') : t('waste.preview.description')}
        action={(
          <button type="button" disabled={isBusy} onClick={() => void refreshPreview().catch((error) => setFeedback(error instanceof Error ? error.message : t('waste.settings.error')))} className="glass-icon-button h-10 w-10 shrink-0 disabled:opacity-35" aria-label={t('waste.preview.refresh')} title={t('waste.preview.refresh')}><RefreshCw size={16} /></button>
        )}
      >
        {preview?.warnings.length ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
            <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{t('waste.preview.warning')}</p>
            {preview.warnings.map((warning) => <p key={warning} className="mt-1 pl-6 opacity-80">{warning}</p>)}
          </div>
        ) : null}
        <WeekDayStrip
          days={weekDays}
          badgesByDay={badgesByDay}
          selectedDay={activeDay}
          onSelectDay={setSelectedDay}
          ariaLabel={t('waste.preview.title')}
          dayAccessibleName={({ iso }) => {
            const entries = previewByDay.get(iso) ?? [];
            return `${dayLabel(iso)}: ${entries.length > 0 ? entries.map((entry) => entry.summary).join(', ') : t('waste.preview.empty')}`;
          }}
          locale={locale}
        />
        <div className={`${rowClass} px-4`} aria-live="polite">
          <p className="text-sm font-semibold first-letter:uppercase">{dayLabel(activeDay)}</p>
          {activeEntries.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {activeEntries.map((entry) => (
                <li key={entry.uid} className="flex items-center gap-2.5 text-sm">
                  <WasteTypeBadge icon={entry.icon} color={entry.color} size={26} />
                  {entry.summary}
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{t('waste.preview.empty')}</p>}
        </div>
      </Section>

      <Section title={t('waste.sources.title')} description={t('waste.sources.description')}>
        {document.sources.length === 0 ? <p className="text-sm text-[color:var(--ui-text-secondary)]">{t('waste.sources.empty')}</p> : null}
        {document.sources.map((source) => {
          const isCalendar = source.kind === 'calendar';
          const Icon = isCalendar ? CalendarRange : CalendarDays;
          const title = isCalendar ? t('waste.sources.calendar') : t('waste.sources.fixed');
          return (
            <div key={source.id} className={`${rowClass} p-3.5 ${source.enabled ? '' : 'opacity-70'}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-accent)]"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{title}</h3>
                  <p className="truncate text-[11px] text-[color:var(--ui-text-secondary)]">{isCalendar ? friendlyName(source.entityIds[0] ?? '', haStates) : t('waste.sources.fixedHint')}</p>
                </div>
                <GlassToggle checked={source.enabled} onChange={(enabled) => updateSource(source.id, { enabled })} label={`${t('waste.sources.enabled')} · ${title}`} disabled={!canConfigure} />
                <button type="button" disabled={!canConfigure} onClick={() => removeSource(source, title)} className={removeButtonClass} aria-label={`${t('waste.common.remove')} ${title}`}><Trash2 size={16} /></button>
              </div>
              {isCalendar ? renderCalendarSource(source) : renderFixedSource(source)}
            </div>
          );
        })}
        {!hasFixedSource || showCalendarTile ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {!hasFixedSource ? (
          <button type="button" disabled={!canConfigure} onClick={addFixedSource} className="liquid-glass-control flex min-h-16 items-center gap-3 rounded-2xl px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40">
            <CalendarDays size={18} className="shrink-0 text-[color:var(--ui-accent)]" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{t('waste.sources.fixed')}</span><span className="block text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{t('waste.sources.fixedHint')}</span></span>
          </button>
          ) : null}
          {showCalendarTile ? (
          <button type="button" disabled={!canConfigure || calendarEntities.length === 0} onClick={addCalendarSource} className="liquid-glass-control flex min-h-16 items-center gap-3 rounded-2xl px-3.5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40">
            <CalendarRange size={18} className="shrink-0 text-[color:var(--ui-accent)]" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{t('waste.sources.calendar')}</span><span className="block text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{calendarEntities.length === 0 ? t('waste.sources.noCalendars') : t('waste.sources.calendarHint')}</span></span>
          </button>
          ) : null}
        </div>
        ) : null}
      </Section>

      <Section title={t('waste.types.title')} description={t('waste.types.description')}>
        {document.wasteTypes.map((wasteType) => (
          <div key={wasteType.id} className={`${rowClass} grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem] items-center gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_2.5rem_2.5rem_2.5rem]`}>
            <input disabled={!canConfigure} aria-label={t('waste.types.name')} className={`${inputClass} font-semibold`} value={wasteType.name} onChange={(event) => updateType(wasteType.id, { name: event.target.value })} />
            {(() => {
              const TypeIcon = resolveWasteTypeIcon(wasteType.icon);
              const open = iconPickerTypeId === wasteType.id;
              return (
                <button
                  type="button"
                  disabled={!canConfigure}
                  aria-label={t('waste.types.icon', { name: wasteType.name })}
                  aria-expanded={open}
                  aria-controls={`${wasteType.id}-icons`}
                  onClick={() => setIconPickerTypeId(open ? null : wasteType.id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50 sm:col-start-3 sm:row-start-1 ${open ? 'ring-2 ring-[color:var(--ui-accent)]' : ''}`}
                  style={{ backgroundColor: `${wasteType.color}26`, color: wasteType.color }}
                >
                  <TypeIcon size={18} strokeWidth={2.25} />
                </button>
              );
            })()}
            <div className="sm:col-start-4 sm:row-start-1">
              <ColorSwatch color={wasteType.color} label={t('waste.types.colorOf', { name: wasteType.name })} disabled={!canConfigure} onChange={(color) => updateType(wasteType.id, { color })} />
            </div>
            <button type="button" disabled={!canConfigure || document.wasteTypes.length <= 1} onClick={() => removeType(wasteType)} className={`${removeButtonClass} sm:col-start-5 sm:row-start-1`} aria-label={`${t('waste.common.remove')} ${wasteType.name}`}><Trash2 size={16} /></button>
            <input disabled={!canConfigure} aria-label={t('waste.types.aliases', { name: wasteType.name })} placeholder={t('waste.types.aliasesPlaceholder')} className={`${inputClass} col-span-4 text-xs sm:col-span-1 sm:col-start-2 sm:row-start-1`} value={wasteType.aliases.join(', ')} onChange={(event) => updateType(wasteType.id, { aliases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
            {iconPickerTypeId === wasteType.id ? (
              <div id={`${wasteType.id}-icons`} role="group" aria-label={t('waste.types.icon', { name: wasteType.name })} className={`col-span-full flex flex-wrap gap-1.5 ${dividerClass}`}>
                {WASTE_TYPE_ICONS.map(({ id, Icon, labelKey }) => {
                  const selected = wasteType.icon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={t(labelKey)}
                      title={t(labelKey)}
                      onClick={() => {
                        updateType(wasteType.id, { icon: id });
                        setIconPickerTypeId(null);
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${selected ? 'text-white' : chipOffClass}`}
                      style={selected ? { backgroundColor: wasteType.color } : undefined}
                    >
                      <Icon size={18} strokeWidth={2.25} />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" disabled={!canConfigure} onClick={addType} className={secondaryButtonClass}><Plus size={15} />{t('waste.types.add')}</button>
      </Section>

      <Section title={t('waste.exceptions.title')} description={t('waste.exceptions.description')}>
        {document.exceptions.map((exception) => (
          <div key={exception.id} className={`${rowClass} grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_11rem_2.5rem]`}>
            <input disabled={!canConfigure} type="date" aria-label={t('waste.common.date')} className={inputClass} value={exception.date} onChange={(event) => updateException(exception.id, { date: event.target.value })} />
            <button type="button" disabled={!canConfigure} onClick={() => removeWithUndo(t('waste.exceptions.item'), 0, (current) => ({ ...current, exceptions: current.exceptions.filter((item) => item.id !== exception.id) }))} className={`${removeButtonClass} sm:col-start-4 sm:row-start-1`} aria-label={t('waste.common.remove')}><Trash2 size={15} /></button>
            <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
              <GlassDropdown
                ariaLabel={t('waste.common.type')}
                options={typeOptions}
                selected={typeOption(exception.wasteTypeId)}
                onChange={(option) => updateException(exception.id, { wasteTypeId: option.id })}
                disabled={!canConfigure}
                buttonClassName="min-h-10"
              />
              <GlassSegmentSelect<WasteException['action']>
                ariaLabel={t('waste.exceptions.action')}
                options={[
                  { value: 'skip', label: t('waste.exceptions.action.skip') },
                  { value: 'add', label: t('waste.exceptions.action.add') },
                ]}
                value={exception.action}
                onChange={(action) => updateException(exception.id, { action })}
                disabled={!canConfigure}
              />
            </div>
          </div>
        ))}
        <button type="button" disabled={!canConfigure || document.wasteTypes.length === 0} onClick={addException} className={secondaryButtonClass}><Plus size={15} />{t('waste.exceptions.add')}</button>
      </Section>

      <Section title={t('waste.notifications.title')} description={t('waste.notifications.description')}>
        <div className={`${rowClass} space-y-3 px-4`}>
          <div className="flex min-h-10 items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold"><BellRing size={17} />{t('waste.notifications.enabled')}</span>
            <GlassToggle checked={document.notifications.enabled} onChange={(enabled) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, enabled } }))} label={t('waste.notifications.enabled')} disabled={!canConfigure} />
          </div>
          {document.notifications.enabled ? (
            <>
              <label className={`flex items-center justify-between gap-3 ${dividerClass} ${fieldLabelClass}`}>{t('waste.notifications.time')}
                <input disabled={!canConfigure} type="time" className="ui-input min-h-10 w-32 shrink-0 rounded-xl px-3 py-2 text-sm" value={document.notifications.time} onChange={(event) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, time: event.target.value } }))} />
              </label>
              <div className={dividerClass}>
                <p className={fieldLabelClass}>{t('waste.notifications.targets')}</p>
                {notifyOptions.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={t('waste.notifications.targets')}>
                    {notifyOptions.map((option) => {
                      const selected = document.notifications.targets.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!canConfigure}
                          aria-pressed={selected}
                          title={option.id}
                          onClick={() => toggleTarget(option.id)}
                          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${selected ? 'bg-[color:var(--ui-accent)] text-white' : chipOffClass}`}
                        >
                          {option.label}
                          {option.detail ? <span className="font-normal opacity-70">{option.detail}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-tertiary)]">{t('waste.notifications.targetsEmpty')}</p>
                    <input disabled={!canConfigure} aria-label={t('waste.notifications.targetsManual')} className={`${inputClass} mt-1.5`} value={document.notifications.targets.join(', ')} onChange={(event) => updateDocument((current) => ({ ...current, notifications: { ...current.notifications, targets: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } }))} placeholder="notify.mobile_app_telefono" />
                  </>
                )}
                {document.notifications.targets.length === 0 ? <p className="mt-1.5 text-xs text-amber-200">{t('waste.notifications.targetsRequired')}</p> : null}
              </div>
              <button type="button" disabled={!canConfigure || isBusy || dirty || document.notifications.targets.length === 0} onClick={() => void handleTest()} className={secondaryButtonClass}><Send size={15} />{status === 'testing' ? t('waste.notifications.testing') : t('waste.notifications.test')}</button>
            </>
          ) : null}
        </div>
      </Section>

      {feedback ? <p role="status" className={`rounded-2xl px-4 py-3 text-xs ${status === 'error' ? 'border border-rose-400/20 bg-rose-500/10 text-rose-100' : 'bg-emerald-500/10 text-emerald-200'}`}>{feedback}</p> : null}

      {canConfigure && (dirty || status === 'saving' || pendingUndo) ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-10 flex justify-end">
          <div className="w-full max-w-md divide-y divide-[color:var(--ui-border)] rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-bg-elevated)] shadow-xl">
            {pendingUndo ? (
              <div role="status" className={footerRowClass}>
                <span className="min-w-0 flex-1">{pendingUndo.message}</span>
                <button type="button" onClick={undoRemoval} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-[color:var(--ui-accent)]"><Undo2 size={16} />{t('waste.undo.action')}</button>
              </div>
            ) : null}
            {dirty || status === 'saving' ? (
              <div className={footerRowClass}>
                <span className="min-w-0 flex-1 text-sm text-[color:var(--ui-text-secondary)]">{t('waste.settings.unsaved')}</span>
                <button type="button" disabled={isBusy} onClick={() => void handleSave()} className="liquid-glass-selection inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50"><Save size={16} />{status === 'saving' ? t('waste.settings.saving') : t('waste.settings.save')}</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
