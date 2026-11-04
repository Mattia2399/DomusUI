/** The option an arrow key leads to in a single choice, or undefined for any other key. */
export function choiceFromKey<T>(key: string, enabled: readonly T[], current: T | null | undefined): T | undefined {
  if (enabled.length === 0) return undefined;
  if (key === 'Home') return enabled[0];
  if (key === 'End') return enabled[enabled.length - 1];
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return undefined;
  const at = current === null || current === undefined ? -1 : enabled.indexOf(current);
  if (at < 0) return enabled[0];
  return enabled[(at + step + enabled.length) % enabled.length];
}
