import React from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import './editor.css';

export type FoldRowProps = {
  label: React.ReactNode;
  /** What it is set to, on the right while closed. */
  value?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
};

/* A row with its label and value that opens on its own control. */
export function FoldRow({ label, value, open, onToggle, children, className }: FoldRowProps) {
  const id = React.useId();
  return (
    <div className={clsx('editor-fold', open && 'is-open', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>{label}</span>
        {value !== undefined && value !== null ? <em>{value}</em> : null}
        <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open ? (
        <div id={id} role="region" className="editor-fold-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** One open at a time: touching another closes the first, touching it again closes it. */
export function useOneOpen<T extends string>(initial: T | null = null) {
  const [open, setOpen] = React.useState<T | null>(initial);
  return { open, toggle: (key: T) => setOpen((current) => (current === key ? null : key)), close: () => setOpen(null), isOpen: (key: T) => open === key };
}

export default FoldRow;
