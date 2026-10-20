const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

/*
 * Cold starts of the distributed build (dist/) around first-run setup
 * (docs/performance-onboarding-boot.md): a home already set up never asks for
 * the setup code, a new one gets it with the words of its language, an
 * interrupted setup resumes where it was, and a file that cannot be loaded
 * shows the reload screen without ever counting setup as finished.
 * Chunk names come from build/bundle-graph.json, never from guessed hashes.
 */

const graph = JSON.parse(readFileSync(path.join(__dirname, '..', 'build', 'bundle-graph.json'), 'utf8'));
const chunkOf = (source) => {
  const file = Object.entries(graph.chunks).find(([, chunk]) => chunk.src === source)?.[0];
  if (!file) throw new Error(`No chunk for ${source} in build/bundle-graph.json`);
  return `/${file}`;
};
const SETUP = chunkOf('src/components/onboarding/OnboardingExperience.tsx');
const WORDS = Object.fromEntries(['it', 'en', 'fr'].map((locale) => [locale, chunkOf(`src/i18n/onboarding/${locale}.ts`)]));
const JOURNEY_KEY = 'ha.dashboard.setupJourney.v2';

/** A clean device, with a setup journey at `phase` when given (once per test, not on reload). */
async function startDevice(page, phase) {
  await page.addInitScript(([key, stored]) => {
    if (sessionStorage.getItem('onboarding-cold-start.smoke')) return;
    sessionStorage.setItem('onboarding-cold-start.smoke', '1');
    localStorage.clear();
    localStorage.setItem('domusui.language.v1', 'it');
    if (stored) localStorage.setItem(key, JSON.stringify({ version: 2, ...stored, updatedAt: Date.now() }));
  }, [JOURNEY_KEY, phase ? { phase, mode: phase === 'done' ? 'demo' : 'real', connectionMethod: 'direct' } : null]);
}

function watch(page) {
  const requested = [];
  const problems = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return { requested, problems, asked: (file) => requested.some((name) => name.endsWith(file)) };
}

const storedPhase = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').phase, JOURNEY_KEY);

test('a home already set up starts without the setup screens', async ({ page }) => {
  const seen = watch(page);
  await startDevice(page, 'done');
  await page.goto('/home');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#root > *').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Tutta la casa/ })).toHaveCount(0);
  expect(seen.asked(SETUP), 'the setup code was requested').toBe(false);
  // Only the words of the starting language come with startup.
  expect(seen.asked(WORDS.it)).toBe(true);
  expect(seen.asked(WORDS.en) || seen.asked(WORDS.fr)).toBe(false);
  expect(seen.problems).toEqual([]);
});

test('a new home gets the setup screens in its language', async ({ page }) => {
  const seen = watch(page);
  await startDevice(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tutta la casa\.\s*Un solo gesto\./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inizia ora' })).toBeVisible();
  expect(seen.asked(SETUP)).toBe(true);
  expect(seen.asked(WORDS.en) || seen.asked(WORDS.fr)).toBe(false);
  expect(seen.problems).toEqual([]);
});

test('an interrupted setup resumes at the step it reached', async ({ page }) => {
  const seen = watch(page);
  await startDevice(page, 'choice');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Come vuoi iniziare?' })).toBeVisible();
  expect(await storedPhase(page)).toBe('choice');
  expect(seen.problems).toEqual([]);
});

for (const [what, file] of [['the setup words', WORDS.it], ['the setup code', SETUP]]) {
  test(`when ${what} cannot be loaded, setup offers to reload and is not finished`, async ({ page }) => {
    await startDevice(page, 'welcome');
    const blocked = (url) => new URL(url).pathname.endsWith(file);
    await page.route(blocked, (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.getByText('Contenuto non caricato')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Tutta la casa/ })).toHaveCount(0);
    expect(await storedPhase(page)).toBe('welcome');
    await expect(page).not.toHaveURL(/\/home$/);

    // Once the network is back, reloading brings setup back where it was.
    await page.unroute(blocked);
    await page.getByRole('button', { name: 'Ricarica Domus UI' }).click();
    await expect(page.getByRole('heading', { name: /Tutta la casa\.\s*Un solo gesto\./ })).toBeVisible();
    expect(await storedPhase(page)).toBe('welcome');
  });
}
