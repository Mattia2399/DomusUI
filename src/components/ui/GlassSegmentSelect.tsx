import React, { useMemo, useRef } from 'react';
import clsx from 'clsx';

export type GlassSegmentValue = string | number;

export type GlassSegmentOption<T extends GlassSegmentValue> = {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
};

export type GlassSegmentSelectProps<T extends GlassSegmentValue> = {
  options: readonly GlassSegmentOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  optionsClassName?: string;
  optionClassName?: string | ((option: GlassSegmentOption<T>, active: boolean) => string | undefined);
  minOptionWidth?: string;
  scrollable?: boolean;
  disabled?: boolean;
  renderOption?: (option: GlassSegmentOption<T>, active: boolean) => React.ReactNode;
};

function optionAccessibleName<T extends GlassSegmentValue>(option: GlassSegmentOption<T>) {
  if (option.ariaLabel) return option.ariaLabel;
  if (typeof option.label === 'string' || typeof option.label === 'number') return String(option.label);
  return String(option.value);
}

export function GlassSegmentSelect<T extends GlassSegmentValue>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  optionsClassName,
  optionClassName,
  minOptionWidth = '2.5rem',
  scrollable = false,
  disabled = false,
  renderOption,
}: GlassSegmentSelectProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabledIndexes = useMemo(
    () => options.map((option, index) => (!option.disabled ? index : -1)).filter((index) => index >= 0),
    [options],
  );

  const selectAndFocus = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    onChange(option.value);
    const button = buttonRefs.current[index];
    button?.focus();
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    if (enabledIndexes.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const enabledPosition = enabledIndexes.indexOf(currentIndex);
    let targetIndex: number;

    if (event.key === 'Home') targetIndex = enabledIndexes[0];
    else if (event.key === 'End') targetIndex = enabledIndexes[enabledIndexes.length - 1];
    else {
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const startPosition = enabledPosition >= 0 ? enabledPosition : 0;
      targetIndex = enabledIndexes[(startPosition + direction + enabledIndexes.length) % enabledIndexes.length];
    }

    selectAndFocus(targetIndex);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollable) return;
    const rail = event.currentTarget;
    if (rail.scrollWidth <= rail.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    rail.scrollLeft += delta;
  };

  return (
    <div className={clsx('liquid-segmented-control min-w-0', className)}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={clsx('segmented-options', !scrollable && '[grid-auto-columns:auto]', optionsClassName)}
        style={{
          '--segmented-option-min': minOptionWidth,
          ...(!scrollable ? { gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` } : {}),
        } as React.CSSProperties}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      >
        {options.map((option, index) => {
          const active = option.value === value;
          const customClassName = typeof optionClassName === 'function' ? optionClassName(option, active) : optionClassName;
          return (
            <button
              key={String(option.value)}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={optionAccessibleName(option)}
              title={option.title}
              disabled={disabled || option.disabled}
              tabIndex={active || (value === undefined && index === enabledIndexes[0]) ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={clsx(
                'flex h-[38px] min-w-0 items-center justify-center rounded-[13px] px-3 text-[13px] font-semibold transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35',
                active ? 'liquid-segmented-option-active' : 'liquid-segmented-option-inactive',
                customClassName,
              )}
            >
              {renderOption ? renderOption(option, active) : option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GlassSegmentSelect;
