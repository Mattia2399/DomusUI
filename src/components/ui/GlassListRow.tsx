import React from 'react';
import clsx from 'clsx';
import { Check, ChevronRight } from 'lucide-react';
import './glassListRow.css';

export type GlassListRowProps = {
  title: React.ReactNode;
  /** A smaller line under the title. */
  note?: React.ReactNode;
  /** A round icon at the left. */
  icon?: React.ReactNode;
  /** A value at the right, for a row to read. */
  value?: React.ReactNode;
  /** What this row chooses is the one in use. */
  selected?: boolean;
  /** Its icon takes the colour of the device. */
  lit?: boolean;
  /** It leads somewhere else. */
  opens?: boolean;
  /** Without it the row is only to read. */
  onPress?: () => void;
  role?: string;
  disabled?: boolean;
  className?: string;
};

/* A row of a list, as in the settings of a phone: it chooses, it opens, or it is read. */
export function GlassListRow({ title, note, icon, value, selected = false, lit = false, opens = false, onPress, role, disabled, className }: GlassListRowProps) {
  const body = (
    <>
      {icon ? (
        <span className={clsx('glass-list-row-icon', (selected || lit) && 'is-lit')} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="glass-list-row-text">
        <b>{title}</b>
        {note ? <span>{note}</span> : null}
      </span>
      {value !== undefined && value !== null ? <em>{value}</em> : null}
      {selected ? <Check className="glass-list-row-check" size={18} strokeWidth={2.6} aria-hidden="true" /> : null}
      {opens ? <ChevronRight className="glass-list-row-opens" size={18} strokeWidth={2.2} aria-hidden="true" /> : null}
    </>
  );
  const classes = clsx('glass-list-row', selected && 'is-selected', className);
  if (!onPress) return <div className={classes}>{body}</div>;
  return (
    <button type="button" role={role} aria-checked={role ? selected : undefined} disabled={disabled} className={classes} onClick={onPress}>
      {body}
    </button>
  );
}

export type GlassChoiceRowsProps<T extends string> = {
  ariaLabel: string;
  options: readonly { value: T; label: React.ReactNode; note?: React.ReactNode; icon?: React.ReactNode }[];
  value: T | readonly T[] | null | undefined;
  onChange: (value: T) => void;
  /** More than one at a time: the rooms of a robot. */
  multiple?: boolean;
  disabled?: boolean;
};

/** A choice among the rows of a list. */
export function GlassChoiceRows<T extends string>({ ariaLabel, options, value, onChange, multiple = false, disabled }: GlassChoiceRowsProps<T>) {
  const isOn = (option: T) => (typeof value === 'string' ? value === option : Array.isArray(value) && value.includes(option));
  return (
    <div className="glass-choice-rows" role={multiple ? 'group' : 'radiogroup'} aria-label={ariaLabel}>
      {options.map((option) => (
        <GlassListRow
          key={option.value}
          role={multiple ? 'checkbox' : 'radio'}
          title={option.label}
          note={option.note}
          icon={option.icon}
          selected={isOn(option.value)}
          disabled={disabled}
          onPress={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

export default GlassListRow;
