import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_PERSON_PICTURE_SOURCE_BYTES,
  PersonPictureError,
  buildPersonPictureUrl,
  computeCenterSquareCrop,
  isPersonPictureUrl,
  isValidImageUpload,
  parseImageUploadResponse,
  preparePersonPicture,
} from './personPicture';

const IMAGE_ID = '0123456789abcdef0123456789abcdef';

describe('person picture helpers', () => {
  it('crops the centered square of landscape and portrait images', () => {
    expect(computeCenterSquareCrop(1200, 800)).toEqual({ x: 200, y: 0, side: 800 });
    expect(computeCenterSquareCrop(600, 1000)).toEqual({ x: 0, y: 200, side: 600 });
    expect(computeCenterSquareCrop(512, 512)).toEqual({ x: 0, y: 0, side: 512 });
  });

  it('stores pictures as Home Assistant image-serve URLs', () => {
    const url = buildPersonPictureUrl(IMAGE_ID);
    expect(url).toBe(`/api/image/serve/${IMAGE_ID}/512x512`);
    expect(isPersonPictureUrl(url)).toBe(true);
    expect(isPersonPictureUrl('https://example.com/me.jpg')).toBe(false);
    expect(isPersonPictureUrl(`/api/image/serve/${IMAGE_ID}/512x512?x=1`)).toBe(false);
  });

  it('accepts only small JPEG, PNG or WebP uploads', () => {
    expect(isValidImageUpload(new Blob(['x'], { type: 'image/jpeg' }))).toBe(true);
    expect(isValidImageUpload(new Blob(['x'], { type: 'image/svg+xml' }))).toBe(false);
    expect(isValidImageUpload(new Blob([], { type: 'image/png' }))).toBe(false);
    expect(isValidImageUpload(new Blob([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], { type: 'image/png' }))).toBe(false);
    expect(isValidImageUpload('data:image/png;base64,AAAA')).toBe(false);
  });

  it('reads only a well-formed image id from the upload response', () => {
    expect(parseImageUploadResponse({ id: IMAGE_ID, name: 'x' })).toBe(IMAGE_ID);
    expect(() => parseImageUploadResponse({ id: '../escape' })).toThrow();
    expect(() => parseImageUploadResponse(null)).toThrow();
  });

  it('rejects files that are not images or are too large before decoding them', async () => {
    await expect(preparePersonPicture(new Blob(['x'], { type: 'text/plain' }))).rejects.toMatchObject({ reason: 'invalid' });
    const huge = { type: 'image/jpeg', size: MAX_PERSON_PICTURE_SOURCE_BYTES + 1 } as Blob;
    const error = await preparePersonPicture(huge).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PersonPictureError);
    expect(error).toMatchObject({ reason: 'too_large' });
  });
});
