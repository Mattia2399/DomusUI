import type { ReactNode } from 'react';

/** A titled, grouped list of rows, as used across the profile pages. */
export function ProfileGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
          {title}
        </h2>
        {action}
      </div>
      <div className="divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">
        {children}
      </div>
    </section>
  );
}

export default ProfileGroup;
