import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2';
import geistMonoLatin from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2';

/**
 * Registers the site's self-hosted faces (CSP allows only `font-src 'self'`).
 *
 * Only the Latin subsets are loaded: the copy is Italian, and any other script
 * falls back to the system stack declared in site.css.
 */
let registered = false;

export function registerSiteFonts() {
  if (registered || typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return;
  registered = true;
  const faces = [
    new FontFace('Geist Variable', `url(${geistLatin}) format('woff2')`, { weight: '100 900', display: 'swap' }),
    new FontFace('Geist Mono Variable', `url(${geistMonoLatin}) format('woff2')`, {
      weight: '100 900',
      display: 'swap',
    }),
  ];
  faces.forEach((face) => {
    document.fonts.add(face);
    face.load().catch(() => undefined);
  });
}
