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
  /** `square`: the 32 px square of the grouped lists (GlassList), radius 10. */
  iconShape?: 'round' | 'square';
  /** The icon in the colour of a function (glassTokens.css --fn-*); `accent` is the one of the page. */
  tone?: GlassListTone;
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

export type GlassListTone = 'security' | 'irrigation' | 'climate' | 'energy' | 'waste' | 'app' | 'accent';

/* A row of a list, as in the settings of a phone: it chooses, it opens, or it is read. */
export function GlassListRow({ title, note, icon, iconShape, tone, value, selected = false, lit = false, opens = false, onPress, role, disabled, className }: GlassListRowProps) {
  const body = (
    <>
      {icon ? (
        <span
          className={clsx('glass-list-row-icon', (selected || lit) && 'is-lit', iconShape === 'square' && 'is-square')}
          data-tone={tone}
          style={tone ? ({ '--row-tone': `var(--fn-${tone})`, '--row-tone-ink': `var(--fn-${tone}-ink)` } as React.CSSProperties) : undefined}
          aria-hidden="true"
        >
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
  /** `hero`: rows 72 px tall on one card, which scrolls by itself when they are many. */
  size?: 'default' | 'hero';
  /** Under the rows and always in view: what the choice is for. */
  footer?: React.ReactNode;
};

/** A choice among the rows of a list. */
export function GlassChoiceRows<T extends string>({ ariaLabel, options, value, onChange, multiple = false, disabled, size = 'default', footer }: GlassChoiceRowsProps<T>) {
  const isOn = (option: T) => (typeof value === 'string' ? value === option : Array.isArray(value) && value.includes(option));
  const rows = (
    <div className={clsx('glass-choice-rows', size === 'hero' && 'is-hero is-big-list')} role={multiple ? 'group' : 'radiogroup'} aria-label={ariaLabel}>
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
  if (!footer) return rows;
  return (
    <div className={clsx('glass-choice-box', size === 'hero' && 'is-hero')}>
      {rows}
      <div className="glass-choice-footer">{footer}</div>
    </div>
  );
}

export type GlassValueRow = { key: string; title: React.ReactNode; note?: React.ReactNode; value?: React.ReactNode } | { key: string; heading: React.ReactNode };

/** Rows to read: what a device reports, with their sections. */
export function GlassValueRows({ rows, size = 'default' }: { rows: readonly GlassValueRow[]; size?: 'default' | 'hero' }) {
  return (
    <div className={clsx('glass-choice-rows', size === 'hero' && 'is-hero is-big-list is-values')}>
      {rows.map((row) =>
        'heading' in row ? (
          <p key={row.key} className="glass-list-heading">
            {row.heading}
          </p>
        ) : (
          <GlassListRow key={row.key} title={row.title} note={row.note} value={row.value} />
        ),
      )}
    </div>
  );
}

export default GlassListRow;
