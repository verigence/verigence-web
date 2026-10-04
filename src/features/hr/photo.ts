/**
 * Phone cameras produce photos larger than the 5 MB limit. Shrink to at most 1024 px on the long
 * side as a JPEG before upload; the HR service then re-encodes to its own 512 px size.
 * If the browser cannot decode the file, the original is sent and the service decides.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1024;

export async function preparePhoto(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file (JPEG, PNG or WebP).');
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) return { blob, name: 'photo.jpg' };
  } catch {
    // fall through to the original file
  }
  if (file.size > MAX_PHOTO_BYTES) throw new Error('The photo is larger than 5 MB. Choose a smaller one.');
  return { blob: file, name: file.name || 'photo' };
}
