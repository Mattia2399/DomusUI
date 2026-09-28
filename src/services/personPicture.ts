/**
 * Person pictures, stored the way the Home Assistant frontend stores them:
 * the image is uploaded to `/api/image/upload` and the person keeps the
 * `/api/image/serve/<id>/512x512` URL.
 *
 * Domus always uploads a centered square JPEG of at most 512px, so the panel
 * bridge only has to accept small images of a known type.
 */

export const PERSON_PICTURE_SIZE = 512;
/** Largest source image the user can pick (phone photos included). */
export const MAX_PERSON_PICTURE_SOURCE_BYTES = 15 * 1024 * 1024;
/** Largest image the bridge forwards to Home Assistant. */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const IMAGE_ID_PATTERN = /^[a-f0-9]{32}$/;
const PERSON_PICTURE_URL_PATTERN = /^\/api\/image\/serve\/[a-f0-9]{32}\/512x512$/;

export class PersonPictureError extends Error {
  constructor(readonly reason: 'invalid' | 'too_large') {
    super(reason);
    this.name = 'PersonPictureError';
  }
}

export function buildPersonPictureUrl(imageId: string) {
  return `/api/image/serve/${imageId}/${PERSON_PICTURE_SIZE}x${PERSON_PICTURE_SIZE}`;
}

export function isPersonPictureUrl(value: unknown): value is string {
  return typeof value === 'string' && PERSON_PICTURE_URL_PATTERN.test(value);
}

export function isValidImageUpload(value: unknown): value is Blob {
  return (
    typeof Blob !== 'undefined' &&
    value instanceof Blob &&
    (IMAGE_UPLOAD_TYPES as readonly string[]).includes(value.type) &&
    value.size > 0 &&
    value.size <= MAX_IMAGE_UPLOAD_BYTES
  );
}

/** Reads the image id from the `/api/image/upload` response. */
export function parseImageUploadResponse(payload: unknown) {
  const id = payload && typeof payload === 'object' ? (payload as { id?: unknown }).id : undefined;
  if (typeof id !== 'string' || !IMAGE_ID_PATTERN.test(id)) {
    throw new Error('Risposta di caricamento immagine non valida.');
  }
  return id;
}

/** The centered square of a width × height image. */
export function computeCenterSquareCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    side,
  };
}

async function decodeImage(file: Blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Crops the picked image to a centered square and scales it down to 512px,
 * returning a JPEG. The browser decodes the format (HEIC included on Safari),
 * so the upload is always a small, known image.
 */
export async function preparePersonPicture(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PersonPictureError('invalid');
  if (file.size > MAX_PERSON_PICTURE_SOURCE_BYTES) throw new PersonPictureError('too_large');

  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await decodeImage(file);
  } catch {
    throw new PersonPictureError('invalid');
  }
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
  if (!width || !height) throw new PersonPictureError('invalid');

  const crop = computeCenterSquareCrop(width, height);
  const size = Math.min(PERSON_PICTURE_SIZE, crop.side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new PersonPictureError('invalid');
  context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, size, size);
  if ('close' in image) image.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob || blob.size > MAX_IMAGE_UPLOAD_BYTES) throw new PersonPictureError('invalid');
  return blob;
}
