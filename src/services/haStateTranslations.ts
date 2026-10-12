/*
 * Home Assistant's own words for entity states, as its frontend shows them.
 * `frontend/get_translations` returns flat keys such as
 *   component.light.entity_component._.state.on            → "Acceso"
 *   component.binary_sensor.entity_component.door.state.on → "Aperta"
 *   component.hue.entity.sensor.<translation_key>.state.x  → integration words
 * Loaded once per language and kept for the session.
 */

export type HaStateTranslations = Record<string, string>;

export type HaTranslationsCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

const CATEGORIES = ['entity_component', 'entity'] as const;
const cache = new Map<string, Promise<HaStateTranslations>>();

function readResources(response: unknown): HaStateTranslations {
  if (!response || typeof response !== 'object') return {};
  const resources = (response as { resources?: unknown }).resources;
  if (!resources || typeof resources !== 'object') return {};
  return Object.fromEntries(
    Object.entries(resources as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[0].includes('.state.'),
    ),
  );
}

/** The state words for `language`; an empty map when Home Assistant cannot answer. */
export function loadHaStateTranslations(callApi: HaTranslationsCallApi, language: string) {
  const cached = cache.get(language);
  if (cached) return cached;
  const request = Promise.all(
    CATEGORIES.map((category) =>
      callApi({ type: 'frontend/get_translations', language, category }, { reportError: false }),
    ),
  )
    .then((responses) => Object.assign({}, ...responses.map(readResources)) as HaStateTranslations)
    .then((translations) => {
      // Nothing came back: try again next time instead of keeping an empty answer.
      if (Object.keys(translations).length === 0) cache.delete(language);
      return translations;
    })
    .catch(() => {
      cache.delete(language);
      return {};
    });
  cache.set(language, request);
  return request;
}

/** For tests only. */
export function clearHaStateTranslationsCache() {
  cache.clear();
}

export function translateHaState(
  translations: HaStateTranslations,
  {
    domain,
    state,
    deviceClass,
    platform,
    translationKey,
  }: { domain: string; state: string; deviceClass?: string; platform?: string; translationKey?: string },
): string | null {
  if (platform && translationKey) {
    const own = translations[`component.${platform}.entity.${domain}.${translationKey}.state.${state}`];
    if (own) return own;
  }
  if (deviceClass) {
    const byClass = translations[`component.${domain}.entity_component.${deviceClass}.state.${state}`];
    if (byClass) return byClass;
  }
  return translations[`component.${domain}.entity_component._.state.${state}`] ?? null;
}
