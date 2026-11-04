import React from 'react';

export type SliderCommit = 'live' | 'release';

/** A slider sends its value while it is dragged, or once, when it is let go. */
export function useSliderValue(value: number, commit: SliderCommit, onValueChange: (value: number) => void) {
  const [dragged, setDragged] = React.useState<number | null>(null);
  const finish = () => {
    if (dragged === null) return;
    setDragged(null);
    onValueChange(dragged);
  };
  return {
    shown: dragged ?? value,
    change: (next: number) => {
      if (commit === 'release') setDragged(next);
      else onValueChange(next);
    },
    release: { onPointerUp: finish, onKeyUp: finish, onBlur: finish, onTouchEnd: finish },
  };
}
