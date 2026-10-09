/** Placeholder rows while the profile, or the page itself, loads. */
export function PersonalDevicesSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      {[1, 2].map((rows) => (
        <div key={rows} className="space-y-2">
          <span className="mx-1 block h-3 w-28 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)] motion-reduce:animate-none" />
          <div className="divide-y divide-[color:var(--ui-separator)] rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)]">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-4">
                <span className="h-10 w-10 shrink-0 animate-pulse rounded-[0.95rem] bg-[color:var(--ui-fill-secondary)] motion-reduce:animate-none" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-2/5 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)] motion-reduce:animate-none" />
                  <span className="block h-3 w-3/5 animate-pulse rounded-full bg-[color:var(--ui-fill-tertiary)] motion-reduce:animate-none" />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default PersonalDevicesSkeleton;
