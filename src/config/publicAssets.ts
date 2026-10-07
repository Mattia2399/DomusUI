/*
 * URLs of files in public/ (images/energy/…). The HACS build uses a relative
 * base ('./'): a relative URL resolves against the page, and outside Home
 * Assistant the router moves the page to /consumi/energia, so './images/…'
 * would point to /consumi/images/… and fail. The folder of the app is read
 * once at startup, while the page is still index.html, the same place its
 * scripts and stylesheets resolve from. An absolute base (dev server, tests)
 * is used as it is.
 */

const resolveAppBase = () => new URL(import.meta.env.BASE_URL, document.baseURI).href;

let appBase: string | null = null;

/** Records the folder of the app; called by main.tsx before the router starts. */
export function captureAppBase() {
  if (!import.meta.env.BASE_URL.startsWith('/')) appBase = resolveAppBase();
}

/** A file of public/, e.g. `images/energy/mobile/grid-only.png`. */
export function publicAssetUrl(path: string) {
  if (import.meta.env.BASE_URL.startsWith('/')) return `${import.meta.env.BASE_URL}${path}`;
  return `${appBase ?? resolveAppBase()}${path}`;
}
