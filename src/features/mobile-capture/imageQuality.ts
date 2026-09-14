import { Capacitor } from '@capacitor/core';

import type { PageQualityFailureCode, PageQualityMetrics, PageQualityResult } from './types';

/**
 * Initial field-capture floor. These values are intentionally conservative:
 * reject images that are clearly unfit for document understanding without
 * trying to make a cheap handset compete with Gemini's own vision stack.
 * They must be calibrated against the dealer-document UAT corpus before GA.
 */
export const MOBILE_CAPTURE_QUALITY_POLICY = {
  minShortEdgePx: 1000,
  minLongEdgePx: 1600,
  minPixelCount: 1_500_000,
  analysisLongEdgePx: 1024,
  minLaplacianVariance: 35,
  tooDarkMeanLuminance: 58,
  tooDarkPixelRatio: 0.58,
  tooBrightMeanLuminance: 244,
  tooBrightPixelRatio: 0.92,
  nearBlankStdDev: 11,
  nearBlankEdgeRatio: 0.004,
  normalizedLongEdgePx: 2400,
  jpegQuality: 0.82,
} as const;

type PageSource = { sourceUri?: string; sourceBlob?: Blob };

interface DecodedImage {
  image: HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The scanned page could not be encoded.'));
    }, 'image/jpeg', quality);
  });
}

export async function pageSourceToBlob(source: PageSource): Promise<Blob> {
  if (source.sourceBlob) return source.sourceBlob;
  if (!source.sourceUri) throw new Error('No image source is available for this scanned page.');

  const response = await fetch(Capacitor.convertFileSrc(source.sourceUri));
  if (!response.ok) throw new Error(`The scanned page could not be read (${response.status}).`);
  return response.blob();
}

async function decodePage(source: PageSource): Promise<DecodedImage> {
  const blob = await pageSourceToBlob(source);
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The scanned page is not a readable image.'));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The scanned page has no usable dimensions.');
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function analyzePixels(image: HTMLImageElement, originalWidth: number, originalHeight: number): PageQualityMetrics {
  const longEdge = Math.max(originalWidth, originalHeight);
  const scale = Math.min(1, MOBILE_CAPTURE_QUALITY_POLICY.analysisLongEdgePx / longEdge);
  const width = Math.max(2, Math.round(originalWidth * scale));
  const height = Math.max(2, Math.round(originalHeight * scale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image analysis is unavailable on this device.');
  context.drawImage(image, 0, 0, width, height);

  const rgba = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
    const value = Math.round((rgba[offset] * 0.299) + (rgba[offset + 1] * 0.587) + (rgba[offset + 2] * 0.114));
    gray[pixel] = value;
    luminanceSum += value;
    luminanceSquaredSum += value * value;
    if (value <= 35) darkPixels += 1;
    if (value >= 245) brightPixels += 1;
  }

  const sampleCount = gray.length;
  const meanLuminance = luminanceSum / sampleCount;
  const luminanceVariance = Math.max(0, (luminanceSquaredSum / sampleCount) - (meanLuminance * meanLuminance));

  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  let edgePixels = 0;
  let interiorCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width) + x;
      const center = gray[index];
      const laplacian = (4 * center) - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width];
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
      const horizontal = Math.abs(gray[index + 1] - gray[index - 1]);
      const vertical = Math.abs(gray[index + width] - gray[index - width]);
      if ((horizontal + vertical) >= 70) edgePixels += 1;
      interiorCount += 1;
    }
  }

  const laplacianMean = interiorCount ? laplacianSum / interiorCount : 0;
  const laplacianVariance = interiorCount
    ? Math.max(0, (laplacianSquaredSum / interiorCount) - (laplacianMean * laplacianMean))
    : 0;

  return {
    width: originalWidth,
    height: originalHeight,
    pixelCount: originalWidth * originalHeight,
    laplacianVariance,
    meanLuminance,
    luminanceStdDev: Math.sqrt(luminanceVariance),
    darkPixelRatio: darkPixels / sampleCount,
    brightPixelRatio: brightPixels / sampleCount,
    edgePixelRatio: interiorCount ? edgePixels / interiorCount : 0,
  };
}

export async function validatePageQuality(source: PageSource): Promise<PageQualityResult> {
  let decoded: DecodedImage | undefined;
  try {
    decoded = await decodePage(source);
    const metrics = analyzePixels(decoded.image, decoded.width, decoded.height);
    const shortEdge = Math.min(metrics.width, metrics.height);
    const longEdge = Math.max(metrics.width, metrics.height);
    const failures: PageQualityFailureCode[] = [];

    if (
      shortEdge < MOBILE_CAPTURE_QUALITY_POLICY.minShortEdgePx
      || longEdge < MOBILE_CAPTURE_QUALITY_POLICY.minLongEdgePx
      || metrics.pixelCount < MOBILE_CAPTURE_QUALITY_POLICY.minPixelCount
    ) failures.push('LOW_RESOLUTION');

    if (
      metrics.laplacianVariance < MOBILE_CAPTURE_QUALITY_POLICY.minLaplacianVariance
      && metrics.edgePixelRatio < 0.018
    ) failures.push('TOO_BLURRY');

    if (
      metrics.meanLuminance < MOBILE_CAPTURE_QUALITY_POLICY.tooDarkMeanLuminance
      && metrics.darkPixelRatio > MOBILE_CAPTURE_QUALITY_POLICY.tooDarkPixelRatio
    ) failures.push('TOO_DARK');

    if (
      metrics.meanLuminance > MOBILE_CAPTURE_QUALITY_POLICY.tooBrightMeanLuminance
      && metrics.brightPixelRatio > MOBILE_CAPTURE_QUALITY_POLICY.tooBrightPixelRatio
      && metrics.luminanceStdDev < 24
    ) failures.push('TOO_BRIGHT');

    if (
      metrics.luminanceStdDev < MOBILE_CAPTURE_QUALITY_POLICY.nearBlankStdDev
      && metrics.edgePixelRatio < MOBILE_CAPTURE_QUALITY_POLICY.nearBlankEdgeRatio
    ) failures.push('NEAR_BLANK');

    return { passed: failures.length === 0, failures, metrics };
  } catch {
    return { passed: false, failures: ['UNREADABLE_IMAGE'] };
  } finally {
    decoded?.cleanup();
  }
}

export async function normalizePageToJpeg(source: PageSource): Promise<Blob> {
  const decoded = await decodePage(source);
  try {
    const longEdge = Math.max(decoded.width, decoded.height);
    const scale = Math.min(1, MOBILE_CAPTURE_QUALITY_POLICY.normalizedLongEdgePx / longEdge);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image normalization is unavailable on this device.');
    context.drawImage(decoded.image, 0, 0, width, height);
    return canvasBlob(canvas, MOBILE_CAPTURE_QUALITY_POLICY.jpegQuality);
  } finally {
    decoded.cleanup();
  }
}

export type PageSplitDirection = 'HORIZONTAL' | 'VERTICAL';

/**
 * Assisted split for the common "two IDs photocopied on one A4 sheet" case.
 * The caller chooses horizontal/vertical and a 30-70% split point. Each crop
 * must pass the same mandatory quality gate before it can be uploaded.
 */
export async function splitPage(
  source: PageSource,
  direction: PageSplitDirection,
  splitPercent: number,
): Promise<[Blob, Blob]> {
  const decoded = await decodePage(source);
  try {
    const ratio = Math.min(0.7, Math.max(0.3, splitPercent / 100));
    const horizontal = direction === 'HORIZONTAL';
    const firstWidth = horizontal ? decoded.width : Math.round(decoded.width * ratio);
    const firstHeight = horizontal ? Math.round(decoded.height * ratio) : decoded.height;
    const secondX = horizontal ? 0 : firstWidth;
    const secondY = horizontal ? firstHeight : 0;
    const secondWidth = horizontal ? decoded.width : decoded.width - firstWidth;
    const secondHeight = horizontal ? decoded.height - firstHeight : decoded.height;

    const renderCrop = async (sx: number, sy: number, sw: number, sh: number): Promise<Blob> => {
      const canvas = makeCanvas(sw, sh);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image splitting is unavailable on this device.');
      context.drawImage(decoded.image, sx, sy, sw, sh, 0, 0, sw, sh);
      return canvasBlob(canvas, MOBILE_CAPTURE_QUALITY_POLICY.jpegQuality);
    };

    return [
      await renderCrop(0, 0, firstWidth, firstHeight),
      await renderCrop(secondX, secondY, secondWidth, secondHeight),
    ];
  } finally {
    decoded.cleanup();
  }
}
