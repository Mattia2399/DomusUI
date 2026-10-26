import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RoomTab } from './roomsDirectory';

/** One room in the room selector; a local room carries a small dot. */
export function RoomsTopTab({
  tab,
  isActive,
  onClick,
}: {
  tab: RoomTab;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        clsx(
          'group relative inline-block rounded-lg px-3 pb-1 text-sm font-semibold leading-none tracking-normal transition-colors sm:px-4 sm:text-base',
          isActive
            ? 'text-[color:var(--ui-text-primary)]'
            : 'text-[color:var(--ui-text-tertiary)] hover:text-[color:var(--ui-text-primary)]',
        ),
      )}
    >
      <span className="truncate">{tab.name}</span>
      {tab.source === 'custom' ? (
        <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-sky-300/85" />
      ) : null}
    </button>
  );
}

export default RoomsTopTab;
