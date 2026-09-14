import { PDFDocument } from 'pdf-lib';

import { normalizePageToJpeg } from './imageQuality';
import type { LogicalCapturedDocument } from './types';

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'journey';
}

/** One logical captured document always becomes one PDF before existing API upload. */
export async function buildDocumentPdf(
  document: LogicalCapturedDocument,
  journeyId: string,
  documentNumber: number,
): Promise<File> {
  if (!document.pages.length) throw new Error('A captured document has no pages.');
  if (document.pages.some((page) => !page.quality.passed)) {
    throw new Error('Every page must pass the mobile quality gate before upload.');
  }

  const pdf = await PDFDocument.create();
  for (const page of document.pages) {
    // Normalize sequentially so a 20-page capture is never decoded into the
    // WebView at full resolution all at once. Most logical documents are only
    // one page; the uncommon multi-page case stays bounded to that one PDF.
    const jpeg = await normalizePageToJpeg(page);
    const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
    const image = await pdf.embedJpg(jpegBytes);
    const landscape = image.width > image.height;
    const target = landscape ? A4_LANDSCAPE : A4_PORTRAIT;
    const scale = Math.min(target.width / image.width, target.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const pdfPage = pdf.addPage([target.width, target.height]);
    pdfPage.drawImage(image, {
      x: (target.width - width) / 2,
      y: (target.height - height) / 2,
      width,
      height,
    });
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  const filename = `capture-${safeToken(journeyId)}-${String(documentNumber).padStart(2, '0')}.pdf`;
  return new File([bytes], filename, { type: 'application/pdf' });
}
