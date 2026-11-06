/**
 * Getting a picture ready for an announcement: shrunk on the device so it uploads quickly and stays
 * well under Security's 2 MB limit. Animated GIFs are sent as they are (redrawing would freeze them).
 */

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export interface PreparedImage {
  /** Base64 of the bytes, no data: prefix. */
  data: string;
  width: number;
  height: number;
  bytes: number;
  /** For the preview; release with URL.revokeObjectURL. */
  previewUrl: string;
}

/** The size to draw at so the longer side is at most `max`, keeping the shape. */
export function fitWithin(width: number, height: number, max = IMAGE_MAX_SIDE): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Plain-words problem with a chosen file, or null when it can be used. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Choose a PNG, JPEG, WebP or GIF picture.';
  if (file.type === 'image/gif' && file.size > IMAGE_MAX_BYTES) return 'This GIF is larger than 2 MB. Choose a smaller one.';
  if (file.size > 25 * 1024 * 1024) return 'This picture is too large. Choose one under 25 MB.';
  return null;
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This picture could not be opened.'));
    img.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(sourceUrl);
    if (file.type === 'image/gif') {
      return { data: await toBase64(file), width: img.naturalWidth, height: img.naturalHeight, bytes: file.size, previewUrl: URL.createObjectURL(file) };
    }
    const size = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This picture could not be prepared on this device.');
    context.drawImage(img, 0, 0, size.width, size.height);
    let blob: Blob | null = null;
    for (const quality of [0.9, 0.8, 0.65]) {
      // WebP keeps transparency (a logo or a graphic) and is small; JPEG where WebP is not available.
      blob = (await canvasBlob(canvas, 'image/webp', quality)) ?? (await canvasBlob(canvas, 'image/jpeg', quality));
      if (blob && blob.type !== 'image/webp' && blob.type !== 'image/jpeg') blob = await canvasBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= IMAGE_MAX_BYTES) break;
    }
    if (!blob || blob.size > IMAGE_MAX_BYTES) throw new Error('This picture is still larger than 2 MB after shrinking. Choose a simpler one.');
    return { data: await toBase64(blob), width: size.width, height: size.height, bytes: blob.size, previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
