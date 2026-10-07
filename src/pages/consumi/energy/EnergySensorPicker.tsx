import React from 'react';
import { UI } from './energyModel';
import type { SensorOption } from './energySensorCatalog';

/*
 * Searchable sensor field (ARIA combobox): compatible sensors first, the
 * others shown on request but never selectable, sensors used elsewhere
 * disabled. Typing an id is still possible, e.g. an external statistic.
 */

const LIMIT = 30;

export function EnergySensorPicker({
  id,
  value,
  options,
  taken = {},
  onChange,
  describedBy,
  invalid = false,
  placeholder = 'Cerca per nome o sensor.…',
  autoFocus = false,
  onPick,
}: {
  id: string;
  value: string;
  options: SensorOption[];
  /** Sensor id → where it is already used. */
  taken?: Record<string, string>;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Called after a sensor is chosen from the list (not while typing). */
  onPick?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState<string | null>(null);
  const [all, setAll] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const panel = React.useRef<HTMLDivElement>(null);
  const listId = `${id}-options`;
  const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter((option) =>
    (all || !option.problem) && terms.every((term) => `${option.name} ${option.id}`.toLowerCase().includes(term)));
  const shown = matches.slice(0, LIMIT);
  const usable = (option: SensorOption) => !option.problem && !(taken[option.id] && option.id !== value);
  const hidden = options.filter((option) => option.problem).length;

  // A field low in a scrolling step opens its list below the fold: bring it into view.
  React.useEffect(() => {
    if (open) panel.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  const choose = (option: SensorOption) => {
    if (!usable(option)) return;
    onChange(option.id);
    setQuery(null);
    setOpen(false);
    onPick?.();
  };
  const move = (step: number) => {
    if (!shown.length) return;
    let next = active;
    for (let tries = 0; tries < shown.length; tries += 1) {
      next = (next + step + shown.length) % shown.length;
      if (usable(shown[next])) break;
    }
    setActive(next);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        value={query ?? value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setQuery(null); }}
        onChange={(event) => {
          // Typed text is kept as the value too: an id may be one Home Assistant does not list.
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
          onChange(event.target.value.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            else move(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Enter' && open && shown[active]) {
            event.preventDefault();
            choose(shown[active]);
          } else if (event.key === 'Escape' && open) {
            // Closes the list only, not the dialog around it.
            event.stopPropagation();
            setOpen(false);
            setQuery(null);
          }
        }}
        className="liquid-glass-control min-h-10 w-full rounded-xl px-3 font-mono text-sm"
      />
      {open ? (
        <div ref={panel} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] shadow-[var(--ui-shadow-card)]">
          <ul id={listId} role="listbox" aria-label="Sensori disponibili" className="max-h-64 overflow-y-auto py-1">
            {shown.map((option, index) => {
              const usedBy = option.id !== value ? taken[option.id] : undefined;
              const disabled = !usable(option);
              return (
                <li
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.id === value}
                  aria-disabled={disabled}
                  onMouseDown={(event) => { event.preventDefault(); choose(option); }}
                  onMouseEnter={() => setActive(index)}
                  className={`cursor-pointer px-3 py-2 text-sm ${index === active ? 'bg-[color:var(--ui-fill-tertiary)]' : ''} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  <span className="block truncate text-[color:var(--ui-text-primary)]">{option.name}</span>
                  <span className="block truncate font-mono text-[11px] text-[color:var(--ui-text-tertiary)]">
                    {option.id}{option.unit ? ` · ${option.unit}` : ''}{option.device ? ` · ${option.device}` : ''}
                  </span>
                  {option.problem || usedBy ? (
                    <span className="block text-[11px] text-[color:var(--ui-warning)]">{option.problem ?? `Già usato da ${usedBy}`}</span>
                  ) : null}
                </li>
              );
            })}
            {!shown.length ? <li className={`px-3 py-2 ${UI.muted}`}>Nessun sensore corrispondente. Puoi scrivere l’identificativo per intero.</li> : null}
            {matches.length > LIMIT ? <li className={`px-3 py-2 ${UI.muted}`}>Altri {matches.length - LIMIT}: affina la ricerca.</li> : null}
          </ul>
          {hidden ? (
            <label className={`flex min-h-10 items-center gap-2 border-t border-[color:var(--ui-separator)] px-3 ${UI.muted}`} onMouseDown={(event) => event.preventDefault()}>
              <input type="checkbox" checked={all} onChange={(event) => { setAll(event.target.checked); setActive(0); }} />
              Mostra anche i {hidden} sensori non compatibili
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
