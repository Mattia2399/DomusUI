import { validateHassUrl } from './haLive';

/*
 * The Home Assistant addresses this device used for setup, newest first, so
 * the address step can offer them again. Only valid addresses, at most three.
 */

export const RECENT_SETUP_URLS_STORAGE_KEY = 'ha.dashboard.setup.recentUrls.v1';
const MAX_RECENT = 3;

export function readRecentSetupUrls(storage?: Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_SETUP_URLS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => validateHassUrl(entry))
      .flatMap((validation) => (validation.ok ? [validation.url] : []))
      .filter((url, index, all) => all.indexOf(url) === index)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberSetupUrl(url: string, storage?: Storage) {
  const validation = validateHassUrl(url);
  if (!validation.ok || !storage) return readRecentSetupUrls(storage);
  const next = [validation.url, ...readRecentSetupUrls(storage).filter((entry) => entry !== validation.url)].slice(0, MAX_RECENT);
  try {
    storage.setItem(RECENT_SETUP_URLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage only loses the suggestion.
  }
  return next;
}
