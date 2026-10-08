import { Listbox, Transition } from '@headlessui/react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { Fragment, useRef } from 'react';
import { resolveDashboardThemeClass } from './portalTheme';

export type GlassDropdownOption = {
  id: string;
  name: string;
};

type GlassDropdownProps = {
  options: GlassDropdownOption[];
  selected: GlassDropdownOption | null;
  onChange: (option: GlassDropdownOption) => void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'compact';
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  portalZIndex?: number;
};

export function GlassDropdown({
  options,
  selected,
  onChange,
  label,
  ariaLabel,
  placeholder = 'Seleziona',
  disabled = false,
  size = 'default',
  className,
  buttonClassName,
  optionsClassName,
  portalZIndex = 400,
}: GlassDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  return (
    <Listbox value={selected} onChange={(option) => option && onChange(option)} by="id" disabled={disabled}>
      {({ open }) => (
        <div ref={wrapperRef} className={clsx('relative w-full min-w-0', className)}>
          {label ? <Listbox.Label className="mb-2 block text-xs font-medium text-[color:var(--ui-text-secondary)]">{label}</Listbox.Label> : null}

          <Listbox.Button
            aria-label={label ? undefined : ariaLabel}
            className={clsx(
              'liquid-glass-control btn-premium flex w-full items-center justify-between text-left font-medium text-[color:var(--ui-text-primary)] outline-none transition duration-200 hover:brightness-110 focus:!border-[color:var(--ui-focus-ring)] focus:ring-2 focus:ring-[color:var(--ui-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50',
              size === 'compact'
                ? 'gap-2 rounded-xl px-2.5 py-2 text-xs'
                : 'gap-3 rounded-2xl px-3.5 py-2.5 text-sm',
              buttonClassName,
            )}
          >
            <span className={clsx('block min-w-0 truncate', !selected && 'text-[color:var(--ui-text-tertiary)]')}>{selected?.name ?? placeholder}</span>
            <ChevronDown
              aria-hidden="true"
              className={clsx('h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)] transition-transform duration-200', open && 'rotate-180 text-[color:var(--ui-text-primary)]')}
            />
          </Listbox.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 -translate-y-1 scale-[0.98]"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 scale-100"
            leaveTo="opacity-0 -translate-y-1 scale-[0.98]"
          >
            <Listbox.Options
              anchor={{ to: 'bottom start', gap: 8, padding: 12 }}
              portal
              style={{ zIndex: portalZIndex }}
              className={clsx(
                open && resolveDashboardThemeClass(wrapperRef.current),
                'liquid-glass-navigation glass-scrollbar max-h-64 w-[var(--button-width)] origin-top overflow-auto rounded-2xl p-1.5 text-sm text-[color:var(--ui-text-primary)] outline-none',
                optionsClassName,
              )}
            >
              {options.map((option) => (
                <Listbox.Option
                  key={option.id}
                  value={option}
                  className={({ focus, selected: isSelected }) =>
                    clsx(
                      'relative cursor-pointer select-none rounded-xl px-3 py-2.5 pr-9 transition-colors duration-150',
                      focus && 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]',
                      isSelected ? 'font-medium text-[color:var(--ui-text-primary)]' : 'text-[color:var(--ui-text-secondary)]',
                    )
                  }
                >
                  {({ selected: isSelected }) => (
                    <>
                      <span className="block truncate">{option.name}</span>
                      {isSelected ? (
                        <span className="absolute inset-y-0 right-3 flex items-center text-[color:var(--ui-accent)]">
                          <Check aria-hidden="true" className="h-4 w-4" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      )}
    </Listbox>
  );
}

export default GlassDropdown;
