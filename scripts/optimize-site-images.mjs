import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Reproducible local conversion; source photographs stay unchanged.
const output = new URL('../src/components/site/assets/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const name of ['irrigation-smart-hero', 'pool-spa-preview', 'technical-room-preview']) {
    const input = await readFile(new URL(`../src/assets/${name}.jpg`, import.meta.url));
    const result = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const ratio = Math.min(1, 1200 / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * ratio);
      canvas.height = Math.round(image.naturalHeight * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return { url: canvas.toDataURL('image/webp', 0.78), width: canvas.width, height: canvas.height };
    }, `data:image/jpeg;base64,${input.toString('base64')}`);
    if (!result.url.startsWith('data:image/webp;base64,')) throw new Error('WebP encoder unavailable');
    const bytes = Buffer.from(result.url.split(',')[1], 'base64');
    await writeFile(new URL(`${name}.webp`, output), bytes);
    console.log(`${name}: ${input.length} → ${bytes.length} bytes (${result.width}×${result.height})`);
  }
} finally {
  await browser.close();
}
