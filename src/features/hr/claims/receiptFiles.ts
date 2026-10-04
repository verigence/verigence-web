import { MAX_RECEIPT_BYTES } from '../../../services/hr/claims';

/**
 * Receipt photos. The HR service accepts JPEG, PNG and WebP photos of at most 5 MB, re-encodes them
 * to at most 1600 px and drops hidden metadata. Phone cameras make larger files, so a photo is
 * shrunk to the same size in the browser first. If the browser cannot decode the file, the original
 * is sent when it is a type the service accepts and small enough; the service decides.
 */
export const MAX_RECEIPT_SIDE = 1600;
const SERVICE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PreparedReceipt {
  id: string;
  blob: Blob;
  name: string;
}

/** A message when the file cannot be a receipt at all, otherwise null. */
export function receiptFileProblem(file: { type: string; size: number; name?: string }): string | null {
  if (!file.type.startsWith('image/')) return 'Choose a photo of the receipt.';
  if (file.size === 0) return 'This file is empty. Choose another photo.';
  return null;
}

/** A message when the file is not acceptable to the service as it is, otherwise null. */
export function receiptSendProblem(blob: { type: string; size: number }): string | null {
  if (!SERVICE_TYPES.has(blob.type)) return 'Receipts must be a JPEG, PNG or WebP photo.';
  if (blob.size > MAX_RECEIPT_BYTES) return 'A receipt photo is larger than 5 MB. Take or choose a smaller one.';
  return null;
}

/** The size a photo is shrunk to: the long side is at most MAX_RECEIPT_SIDE, never enlarged. */
export function scaledSize(width: number, height: number, maxSide = MAX_RECEIPT_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

let counter = 0;
const nextId = () => `receipt-${Date.now().toString(36)}-${counter++}`;

export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  const first = receiptFileProblem(file);
  if (first) throw new Error(first);
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) {
      const stem = (file.name || 'receipt').replace(/\.[^.]+$/, '').slice(0, 60) || 'receipt';
      const problem = receiptSendProblem(blob);
      if (problem) throw new Error(problem);
      return { id: nextId(), blob, name: `${stem}.jpg` };
    }
  } catch (error) {
    if (error instanceof Error && /larger than 5 MB/.test(error.message)) throw error;
    // fall through: send the original when the service can take it
  }
  const problem = receiptSendProblem(file);
  if (problem) throw new Error(problem);
  return { id: nextId(), blob: file, name: file.name || 'receipt' };
}
