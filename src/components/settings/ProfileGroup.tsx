import { useId, type ReactNode } from 'react';

/** A titled, grouped list of rows, as used across the profile pages. */
export function ProfileGroup({
  title,
  description,
  id,
  action,
  children,
}: {
  title: string;
  /** A few words under the title, read with the group. */
  description?: string;
  id?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={id ? 'scroll-mt-4' : undefined}
    >
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="divide-y divide-[color:var(--ui-separator)] overflow-hidden rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl">
        {children}
      </div>
    </section>
  );
}

export default ProfileGroup;
