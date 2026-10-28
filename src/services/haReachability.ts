/*
 * Whether an address answers, before setup sends the person to sign in there.
 *
 * How: a `fetch` in `no-cors` mode of `/manifest.json`, a static file every
 * Home Assistant serves without signing in. Any HTTP answer, even an error,
 * comes back as an opaque response: something is listening there. A network
 * error (no such host, refused, timeout) is a TypeError: nothing answers.
 * The body is never read, so no permission of the server is needed.
 *
 * How far it can be trusted:
 * - "reachable" is reliable that something answers at that host and port; on
 *   :8123 or at a Home Assistant address that is Home Assistant in practice,
 *   but it cannot be proven without reading the answer.
 * - "unreachable" is reliable for a typo, a wrong port or a switched-off
 *   server. `.local` names need mDNS, which some systems (older Android) lack:
 *   there the address does not work in the browser either.
 * - "unknown" when the page itself forbids the request: a Content Security
 *   Policy that does not list the address, or http from an https page (mixed
 *   content, which setup explains on its own screen). Setup never blocks on
 *   "unknown": it lets the sign-in decide.
 *
 * Discovery uses the same check and only ever says "found" for "reachable",
 * so it can miss a home but never invent one.
 */

export type Reachability = 'reachable' | 'unreachable' | 'unknown';

export const REACHABILITY_TIMEOUT_MS = 1500;
export const DEFAULT_HOME_ASSISTANT_URL = 'http://homeassistant.local:8123';

type ProbeOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  pageProtocol?: string;
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
};

function originOf(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

function isMixedContent(origin: string, pageProtocol: string) {
  if (pageProtocol !== 'https:' || !origin.startsWith('http:')) return false;
  const host = new URL(origin).hostname;
  return !['localhost', '127.0.0.1', '[::1]'].includes(host);
}

export async function probeHomeAssistant(url: string, options: ProbeOptions = {}): Promise<Reachability> {
  const origin = originOf(url);
  if (!origin) return 'unreachable';
  const pageProtocol = options.pageProtocol ?? (typeof window === 'undefined' ? 'http:' : window.location.protocol);
  if (isMixedContent(origin, pageProtocol)) return 'unknown';
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return 'unknown';

  let refusedByPage = false;
  const target = options.target ?? (typeof document === 'undefined' ? null : document);
  const onViolation = (event: Event) => {
    const blocked = (event as SecurityPolicyViolationEvent).blockedURI ?? '';
    if (blocked.startsWith(origin)) refusedByPage = true;
  };
  target?.addEventListener('securitypolicyviolation', onViolation);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), options.timeoutMs ?? REACHABILITY_TIMEOUT_MS);
  try {
    await fetchImpl(`${origin}/manifest.json`, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller?.signal,
    });
    return 'reachable';
  } catch {
    // The violation event is queued: give it a turn before deciding.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return refusedByPage ? 'unknown' : 'unreachable';
  } finally {
    clearTimeout(timer);
    target?.removeEventListener('securitypolicyviolation', onViolation);
  }
}

/**
 * The first of the candidates that answers, in their order; all are tried
 * together, so the search lasts at most one timeout. Null when none answers.
 */
export async function discoverHomeAssistant(candidates: string[], options: ProbeOptions = {}): Promise<string | null> {
  const unique = [...new Set(candidates.filter((candidate) => originOf(candidate)))];
  const results = await Promise.all(unique.map((candidate) => probeHomeAssistant(candidate, options)));
  return unique.find((_, index) => results[index] === 'reachable') ?? null;
}
