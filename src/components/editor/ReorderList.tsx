import React from 'react';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';
import { useEditorWords } from '../../i18n/editorTranslations';
import './editor.css';

/** The ids with one moved by some places, within the ends. */
export function moveItem(ids: readonly string[], id: string, by: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.max(0, Math.min(ids.length - 1, from + by));
  const next = ids.filter((entry) => entry !== id);
  next.splice(to, 0, id);
  return next;
}

/** Where a point falls among the middles of the rows: the place it would take. */
export function placeAmong(middles: readonly number[], y: number) {
  const index = middles.findIndex((middle) => y < middle);
  return index < 0 ? middles.length - 1 : index;
}

export type ReorderListProps<T extends { id: string; name: string }> = {
  items: readonly T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T) => React.ReactNode;
  label: string;
};

/*
 * A list to order by dragging its handle. The handle also answers the arrow keys, and the
 * detail of each row has "Sposta su" and "Sposta giù" for whoever does not drag.
 */
export function ReorderList<T extends { id: string; name: string }>({ items, onReorder, renderItem, label }: ReorderListProps<T>) {
  const words = useEditorWords();
  const listRef = React.useRef<HTMLUListElement>(null);
  const [drag, setDrag] = React.useState<{ id: string; order: string[] } | null>(null);
  const [said, setSaid] = React.useState('');
  const ids = items.map((item) => item.id);
  const order = drag?.order ?? ids;
  const byId = new Map(items.map((item) => [item.id, item]));
  const commit = (next: string[], moved: string) => {
    if (next.join() !== ids.join()) {
      onReorder(next);
      setSaid(words('moved', { name: byId.get(moved)?.name ?? '', n: next.indexOf(moved) + 1 }));
    }
  };
  const middles = () => [...(listRef.current?.children ?? [])].map((row) => {
    const box = row.getBoundingClientRect();
    return box.top + box.height / 2;
  });
  return (
    <>
      <ul ref={listRef} aria-label={label} className="editor-reorder">
        {order.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li key={id} className={clsx(drag?.id === id && 'is-dragged')}>
              <button
                type="button"
                className="editor-handle"
                aria-label={words('dragHandle', { name: item.name })}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setDrag({ id, order: ids });
                }}
                onPointerMove={(event) => {
                  if (!drag || drag.id !== id) return;
                  const target = placeAmong(middles(), event.clientY);
                  const next = moveItem(drag.order, id, target - drag.order.indexOf(id));
                  if (next.join() !== drag.order.join()) setDrag({ id, order: next });
                }}
                onPointerUp={() => {
                  if (drag) commit(drag.order, drag.id);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => {
                  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
                  if (!by) return;
                  event.preventDefault();
                  commit(moveItem(ids, id, by), id);
                }}
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
              <div>{renderItem(item)}</div>
            </li>
          );
        })}
      </ul>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </>
  );
}

export default ReorderList;
