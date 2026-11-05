import React from 'react';
import clsx from 'clsx';
import { GlassDropdown } from './GlassDropdown';
import { GlassChoiceRows } from './GlassListRow';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';

export type GlassSelectMenuProps<T extends string> = GlassControlState & {
  ariaLabel: string;
  options: readonly { value: T; label: string; note?: React.ReactNode; icon?: React.ReactNode }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  placeholder?: string;
  size?: GlassControlSize;
  className?: string;
};

/* A long choice: the menu of the app when it is small, the list with its ticks when it is the protagonist. */
export function GlassSelectMenu<T extends string>({ ariaLabel, options, value, onChange, placeholder, size = 'group', className, disabled, pending, error }: GlassSelectMenuProps<T>) {
  const state = { disabled, pending, error };
  if (size === 'hero') {
    return <GlassChoiceRows ariaLabel={ariaLabel} options={options} value={value} onChange={onChange} disabled={controlBlocked(state)} size="hero" />;
  }
  const items = options.map((option) => ({ id: option.value, name: option.label }));
  return (
    <GlassDropdown
      ariaLabel={ariaLabel}
      options={items}
      selected={items.find((item) => item.id === value) ?? null}
      onChange={(item) => onChange(item.id as T)}
      placeholder={placeholder}
      disabled={controlBlocked(state)}
      size={size === 'compact' ? 'compact' : 'default'}
      className={clsx(controlStateClass(state), className)}
    />
  );
}

export default GlassSelectMenu;
