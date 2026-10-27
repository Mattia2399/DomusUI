import React from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import GlassBottomSheet from '../../components/ui/GlassBottomSheet';
import GlassSearchFilterBar from '../../components/ui/GlassSearchFilterBar';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useI18n } from '../../i18n/I18nProvider';

export type AccessoryCandidate = { id: string; name: string; roomName: string | null; kind?: string };

export function SelectionMark({ on }: { on: boolean }) {
  return (
    <span className={clsx('rv2-radio', on && 'is-on')} aria-hidden="true">
      <Check size={12} strokeWidth={3.2} />
    </span>
  );
}

/** Choose accessories from other rooms, or from none, to bring into this room. */
export function AddAccessoriesSheet({
  isOpen,
  title,
  candidates,
  emptyLabel,
  busy,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  title: string;
  candidates: AccessoryCandidate[];
  emptyLabel: string;
  busy: boolean;
  onClose: () => void;
  onAdd: (ids: string[]) => Promise<boolean>;
}) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const [query, setQuery] = React.useState('');
  const [chosen, setChosen] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setChosen({});
  }, [isOpen]);

  const needle = query.trim().toLocaleLowerCase(locale);
  const shown = candidates.filter((candidate) => !needle || candidate.name.toLocaleLowerCase(locale).includes(needle));
  const ids = candidates.filter((candidate) => chosen[candidate.id]).map((candidate) => candidate.id);

  return (
    <GlassBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onClose}>
            {dt('cancel')}
          </button>
          <button
            type="button"
            className="glass-button glass-button-primary min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
            disabled={ids.length === 0 || busy}
            onClick={() => void onAdd(ids).then((done) => done && onClose())}
          >
            {dt('addCount', { count: ids.length })}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <GlassSearchFilterBar query={query} onQueryChange={setQuery} filters={[]} placeholder={title} />
        {shown.length === 0 ? (
          <p className="dv-t2 m-0 text-sm">{emptyLabel}</p>
        ) : (
          <div role="group" aria-label={title}>
            {shown.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="rv2-row"
                aria-pressed={Boolean(chosen[candidate.id])}
                onClick={() => setChosen((current) => ({ ...current, [candidate.id]: !current[candidate.id] }))}
              >
                <SelectionMark on={Boolean(chosen[candidate.id])} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{candidate.name}</span>
                  <span className="dv-t2 text-[13px]">
                    {[candidate.kind, candidate.roomName ? dt('nowIn', { room: candidate.roomName }) : dt('noRoom')]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </GlassBottomSheet>
  );
}

export default AddAccessoriesSheet;
