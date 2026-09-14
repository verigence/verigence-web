import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

import { captureEvidencePhoto } from '../../services/device/camera';
import {
  ensureGoogleDocumentScanner,
  mobileDocumentScannerEligible,
  recognizeContinuationText,
  scanDocumentPageUris,
  scannerErrorWasCancellation,
} from '../../services/device/documentScanner';
import {
  splitPage,
  validatePageQuality,
  type PageSplitDirection,
} from './imageQuality';
import {
  buildInitialDocumentGroups,
  mergeWithPrevious,
  startNewDocumentAtPage,
} from './continuation';
import { buildDocumentPdf } from './pdf';
import type {
  CapturedPage,
  LogicalCapturedDocument,
  MobileCaptureStage,
  PageQualityFailureCode,
} from './types';
import '../../styles/mobile-document-capture.css';

type CapturePhase = 'IDLE' | 'PREPARING' | 'SCANNING' | 'PROCESSING' | 'REVIEW' | 'FALLBACK' | 'PACKAGING';

interface SplitTarget {
  documentIndex: number;
  pageIndex: number;
  direction: PageSplitDirection;
  percent: number;
}

interface CaptureContext {
  input: HTMLInputElement;
  stage: MobileCaptureStage;
  journeyToken: string;
}

function randomId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function qualityFailureText(code: PageQualityFailureCode): string {
  if (code === 'LOW_RESOLUTION') return 'Resolution is too low';
  if (code === 'TOO_BLURRY') return 'Page is too blurred';
  if (code === 'TOO_DARK') return 'Page is too dark';
  if (code === 'TOO_BRIGHT') return 'Page is overexposed';
  if (code === 'NEAR_BLANK') return 'Almost no readable page detail was found';
  return 'Image could not be read';
}

function countPages(documents: LogicalCapturedDocument[]): number {
  return documents.reduce((total, document) => total + document.pages.length, 0);
}

function releasePagePreview(page: CapturedPage): void {
  if (page.sourceBlob && page.previewUrl.startsWith('blob:')) URL.revokeObjectURL(page.previewUrl);
}

function releaseBlobPreviews(documents: LogicalCapturedDocument[]): void {
  documents.forEach((document) => document.pages.forEach(releasePagePreview));
}

function releaseFallbackPreviews(pages: CapturedPage[]): void {
  pages.forEach(releasePagePreview);
}

function journeyTokenFromPath(stage: MobileCaptureStage): string {
  const path = window.location.pathname;
  const match = stage === 'BOOKING'
    ? path.match(/^\/v2\/bookings\/([^/]+)$/)
    : path.match(/^\/v2\/deliveries\/([^/]+)$/);
  const token = match?.[1];
  if (token && token !== 'new') return token;
  return `${stage.toLowerCase()}-${Date.now()}`;
}

/**
 * The scanner is deliberately attached to the existing Take Photo input rather
 * than to a route. Once scanning finishes, the generated PDFs are assigned back
 * to that input and its existing change handler is fired. Booking and Delivery
 * therefore keep their existing handleUpload(files) path unchanged.
 */
function captureContextForInput(input: HTMLInputElement): CaptureContext | undefined {
  if (input.type !== 'file' || !input.hasAttribute('capture') || input.disabled) return undefined;
  if (!input.accept.toLowerCase().includes('image')) return undefined;

  if (input.closest('.uc03-booking-v2-hero')) {
    return { input, stage: 'BOOKING', journeyToken: journeyTokenFromPath('BOOKING') };
  }
  if (input.closest('.uc03-delivery-v2-hero')) {
    return { input, stage: 'DELIVERY', journeyToken: journeyTokenFromPath('DELIVERY') };
  }
  return undefined;
}

async function analyzedUriPage(uri: string, originalIndex: number): Promise<CapturedPage> {
  const quality = await validatePageQuality({ sourceUri: uri });
  const ocrText = quality.passed ? await recognizeContinuationText(uri) : '';
  return {
    id: randomId('page'),
    sourceUri: uri,
    previewUrl: Capacitor.convertFileSrc(uri),
    quality,
    ocrText,
    originalIndex,
  };
}

async function analyzedBlobPage(blob: Blob, originalIndex: number): Promise<CapturedPage> {
  const quality = await validatePageQuality({ sourceBlob: blob });
  return {
    id: randomId('page'),
    sourceBlob: blob,
    previewUrl: URL.createObjectURL(blob),
    quality,
    // A user-requested split is already an explicit document boundary; no OCR
    // is needed to second-guess it.
    ocrText: '',
    originalIndex,
  };
}

export default function MobileDocumentCaptureHost() {
  const eligible = mobileDocumentScannerEligible();
  const contextRef = useRef<CaptureContext>();
  const launchInFlight = useRef(false);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<MobileCaptureStage>('BOOKING');
  const [phase, setPhase] = useState<CapturePhase>('IDLE');
  const [documents, setDocuments] = useState<LogicalCapturedDocument[]>([]);
  const [fallbackPages, setFallbackPages] = useState<CapturedPage[]>([]);
  const [processing, setProcessing] = useState({ current: 0, total: 0 });
  const [moduleProgress, setModuleProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [fallbackReason, setFallbackReason] = useState<string>();
  const [splitTarget, setSplitTarget] = useState<SplitTarget>();

  const clearSession = useCallback(() => {
    setDocuments((current) => {
      releaseBlobPreviews(current);
      return [];
    });
    setFallbackPages((current) => {
      releaseFallbackPreviews(current);
      return [];
    });
    setSplitTarget(undefined);
    setMessage(undefined);
    setError(undefined);
    setFallbackReason(undefined);
    setModuleProgress(undefined);
    setProcessing({ current: 0, total: 0 });
  }, []);

  const closeCapture = useCallback(() => {
    contextRef.current = undefined;
    launchInFlight.current = false;
    document.documentElement.classList.remove('mobile-document-capture-route');
    setOpen(false);
    setPhase('IDLE');
    clearSession();
  }, [clearSession]);

  const processUris = useCallback(async (uris: string[]) => {
    if (!uris.length) return;
    setPhase('PROCESSING');
    setProcessing({ current: 0, total: uris.length });
    const pages: CapturedPage[] = [];
    for (let index = 0; index < uris.length; index += 1) {
      const page = await analyzedUriPage(uris[index], index);
      pages.push(page);
      setProcessing({ current: index + 1, total: uris.length });
    }
    const newGroups = buildInitialDocumentGroups(pages);
    setDocuments((current) => [...current, ...newGroups]);
    setPhase('REVIEW');
  }, []);

  const beginScanner = useCallback(async (retainReviewOnCancel = false) => {
    if (!contextRef.current || launchInFlight.current) return;
    launchInFlight.current = true;
    setError(undefined);
    setMessage(undefined);
    setModuleProgress(undefined);
    setPhase('PREPARING');
    try {
      await ensureGoogleDocumentScanner((event) => setModuleProgress(event.progress));
      setPhase('SCANNING');
      const uris = await scanDocumentPageUris(20);
      if (!uris.length) {
        if (retainReviewOnCancel) setPhase('REVIEW');
        else closeCapture();
        return;
      }
      await processUris(uris);
    } catch (cause) {
      if (scannerErrorWasCancellation(cause)) {
        if (retainReviewOnCancel) setPhase('REVIEW');
        else closeCapture();
      } else {
        setFallbackReason(cause instanceof Error ? cause.message : 'The Google document scanner is unavailable on this phone.');
        setPhase('FALLBACK');
      }
    } finally {
      launchInFlight.current = false;
    }
  }, [closeCapture, processUris]);

  useEffect(() => {
    if (!eligible) return undefined;

    const interceptTakePhoto = (event: MouseEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : undefined;
      if (!input) return;
      const context = captureContextForInput(input);
      if (!context) return;

      // Cancel only the browser/WebView camera picker. The rest of the screen
      // remains untouched and will receive the final FileList through its
      // existing change handler after review.
      event.preventDefault();
      event.stopPropagation();

      if (contextRef.current || launchInFlight.current) return;
      clearSession();
      contextRef.current = context;
      setStage(context.stage);
      setOpen(true);
      document.documentElement.classList.add('mobile-document-capture-route');
      window.setTimeout(() => void beginScanner(false), 0);
    };

    document.addEventListener('click', interceptTakePhoto, true);
    return () => document.removeEventListener('click', interceptTakePhoto, true);
  }, [beginScanner, clearSession, eligible]);

  useEffect(() => () => {
    document.documentElement.classList.remove('mobile-document-capture-route');
    setDocuments((current) => {
      releaseBlobPreviews(current);
      return current;
    });
    setFallbackPages((current) => {
      releaseFallbackPreviews(current);
      return current;
    });
  }, []);

  const captureFallbackPage = async () => {
    if (fallbackPages.length >= 20) {
      setError('A capture session can contain at most 20 pages. Review these pages before scanning more.');
      return;
    }
    setError(undefined);
    try {
      const photo = await captureEvidencePhoto();
      const uri = photo.path || photo.webPath;
      if (!uri) throw new Error('The camera did not return a usable image.');
      setPhase('PROCESSING');
      setProcessing({ current: 0, total: 1 });
      const page = await analyzedUriPage(uri, fallbackPages.length);
      setFallbackPages((current) => [...current, page]);
      setProcessing({ current: 1, total: 1 });
      setPhase('FALLBACK');
    } catch (cause) {
      setPhase('FALLBACK');
      if (!scannerErrorWasCancellation(cause)) {
        setError(cause instanceof Error ? cause.message : 'The page could not be captured.');
      }
    }
  };

  const reviewFallbackPages = () => {
    if (!fallbackPages.length) return;
    setDocuments((current) => [...current, ...buildInitialDocumentGroups(fallbackPages)]);
    setFallbackPages([]);
    setPhase('REVIEW');
  };

  const retakePage = async (documentIndex: number, pageIndex: number) => {
    setError(undefined);
    try {
      setPhase('SCANNING');
      let uri: string | undefined;
      try {
        const pages = await scanDocumentPageUris(1);
        uri = pages[0];
      } catch (cause) {
        if (scannerErrorWasCancellation(cause)) {
          setPhase('REVIEW');
          return;
        }
        const photo = await captureEvidencePhoto();
        uri = photo.path || photo.webPath;
      }
      if (!uri) throw new Error('No replacement page was captured.');
      setPhase('PROCESSING');
      setProcessing({ current: 0, total: 1 });
      const original = documents[documentIndex]?.pages[pageIndex];
      if (!original) throw new Error('The page to replace is no longer available.');
      const replacement = await analyzedUriPage(uri, original.originalIndex);
      setDocuments((current) => current.map((document, d) => {
        if (d !== documentIndex) return document;
        return {
          ...document,
          pages: document.pages.map((page, p) => {
            if (p !== pageIndex) return page;
            releasePagePreview(page);
            return replacement;
          }),
        };
      }));
      setProcessing({ current: 1, total: 1 });
      setPhase('REVIEW');
    } catch (cause) {
      setPhase('REVIEW');
      setError(cause instanceof Error ? cause.message : 'The page could not be replaced.');
    }
  };

  const confirmSplit = async () => {
    if (!splitTarget) return;
    const document = documents[splitTarget.documentIndex];
    const page = document?.pages[splitTarget.pageIndex];
    if (!page || document.pages.length !== 1) return;
    setError(undefined);
    try {
      const [firstBlob, secondBlob] = await splitPage(page, splitTarget.direction, splitTarget.percent);
      const [first, second] = await Promise.all([
        analyzedBlobPage(firstBlob, page.originalIndex),
        analyzedBlobPage(secondBlob, page.originalIndex + 0.1),
      ]);
      if (!first.quality.passed || !second.quality.passed) {
        URL.revokeObjectURL(first.previewUrl);
        URL.revokeObjectURL(second.previewUrl);
        throw new Error('One of the split documents is below the minimum image quality. Adjust the split and try again.');
      }
      setDocuments((current) => {
        const next = current.map((item) => ({ ...item, pages: [...item.pages] }));
        const original = next[splitTarget.documentIndex];
        releasePagePreview(original.pages[0]);
        next.splice(
          splitTarget.documentIndex,
          1,
          { id: randomId('doc'), pages: [first], autoGrouped: false },
          { id: randomId('doc'), pages: [second], autoGrouped: false },
        );
        return next;
      });
      setSplitTarget(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The page could not be split.');
    }
  };

  const invalidPageCount = documents.reduce(
    (total, document) => total + document.pages.filter((page) => !page.quality.passed).length,
    0,
  );

  const packageAndHandoff = async () => {
    const context = contextRef.current;
    if (!context || !documents.length || invalidPageCount > 0) return;
    setPhase('PACKAGING');
    setError(undefined);
    setMessage(undefined);
    setProcessing({ current: 0, total: documents.length });
    try {
      const files: File[] = [];
      for (let index = 0; index < documents.length; index += 1) {
        files.push(await buildDocumentPdf(documents[index], context.journeyToken, index + 1));
        setProcessing({ current: index + 1, total: documents.length });
      }

      if (typeof DataTransfer === 'undefined') {
        throw new Error('This Android WebView cannot hand captured documents back to the upload screen.');
      }
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      context.input.files = transfer.files;
      const input = context.input;

      // Close the mobile-only surface first. The existing screen then receives
      // a normal change event and executes its unchanged handleUpload(files),
      // so Web and Android are identical from this boundary onward.
      contextRef.current = undefined;
      document.documentElement.classList.remove('mobile-document-capture-route');
      setOpen(false);
      setPhase('IDLE');
      clearSession();
      window.setTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })), 0);
    } catch (cause) {
      setPhase('REVIEW');
      setError(cause instanceof Error ? cause.message : 'The captured documents could not be prepared.');
    }
  };

  if (!eligible || !open || !contextRef.current) return null;

  const stageLabel = stage === 'BOOKING' ? 'Booking' : 'Delivery';
  const totalPages = countPages(documents);

  return (
    <section className="mobile-doc-capture" role="dialog" aria-modal="true" aria-label={`${stageLabel} document capture`}>
      <header className="mobile-doc-capture__header">
        <div>
          <span className="mobile-doc-capture__eyebrow">{stageLabel} · Mobile Capture</span>
          <h2>Scan documents</h2>
        </div>
        {phase !== 'PACKAGING' && phase !== 'PROCESSING' && phase !== 'SCANNING' && phase !== 'PREPARING' ? (
          <button type="button" className="mobile-doc-capture__close" onClick={closeCapture} aria-label="Close document capture">×</button>
        ) : null}
      </header>

      {error ? <div className="mobile-doc-capture__alert is-error" role="alert">{error}</div> : null}
      {message ? <div className="mobile-doc-capture__alert is-success" role="status">{message}</div> : null}

      {phase === 'PREPARING' ? (
        <div className="mobile-doc-capture__state">
          <div className="mobile-doc-capture__spinner" aria-hidden="true" />
          <strong>Preparing secure document scanner</strong>
          <p>Google Play services is checking the on-device scanning module.</p>
          {moduleProgress !== undefined ? <progress max={100} value={moduleProgress}>{moduleProgress}%</progress> : null}
        </div>
      ) : null}

      {phase === 'SCANNING' ? (
        <div className="mobile-doc-capture__state">
          <div className="mobile-doc-capture__spinner" aria-hidden="true" />
          <strong>Scanner open</strong>
          <p>Capture the pages in the order they appear in the physical file.</p>
        </div>
      ) : null}

      {phase === 'PROCESSING' ? (
        <div className="mobile-doc-capture__state">
          <div className="mobile-doc-capture__spinner" aria-hidden="true" />
          <strong>Checking captured pages</strong>
          <p>Page {Math.max(1, processing.current)} of {Math.max(1, processing.total)} · checking resolution, focus, exposure and document continuity.</p>
          <progress max={Math.max(1, processing.total)} value={processing.current} />
        </div>
      ) : null}

      {phase === 'PACKAGING' ? (
        <div className="mobile-doc-capture__state">
          <div className="mobile-doc-capture__spinner" aria-hidden="true" />
          <strong>Preparing documents</strong>
          <p>Document {Math.max(1, processing.current)} of {Math.max(1, processing.total)} · creating upload-ready PDFs.</p>
          <progress max={Math.max(1, processing.total)} value={processing.current} />
        </div>
      ) : null}

      {phase === 'FALLBACK' ? (
        <div className="mobile-doc-capture__fallback">
          <div className="mobile-doc-capture__alert is-warning">
            <strong>Using basic camera mode</strong>
            <span>{fallbackReason || 'The Google document scanner is unavailable on this handset.'}</span>
          </div>
          <p>Capture one page at a time. Every page still has to pass the same Verigence quality gate before it can continue.</p>
          <div className="mobile-doc-capture__fallback-count">{fallbackPages.length} / 20 pages captured</div>
          <div className="mobile-doc-capture__footer-actions">
            <button type="button" className="mobile-doc-capture__secondary" disabled={fallbackPages.length >= 20} onClick={() => void captureFallbackPage()}>
              Capture page
            </button>
            <button type="button" className="mobile-doc-capture__primary" disabled={!fallbackPages.length} onClick={reviewFallbackPages}>
              Review pages
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'REVIEW' ? (
        <div className="mobile-doc-capture__review">
          <div className="mobile-doc-capture__summary">
            <div><strong>{documents.length}</strong><span>documents</span></div>
            <div><strong>{totalPages}</strong><span>pages</span></div>
            <div className={invalidPageCount ? 'is-bad' : 'is-good'}><strong>{invalidPageCount}</strong><span>pages to retake</span></div>
          </div>

          <p className="mobile-doc-capture__hint">
            Check document boundaries carefully. The first page identifies each document for server-side classification. Verigence keeps pages separate unless local evidence strongly indicates a continuation.
          </p>

          <div className="mobile-doc-capture__documents">
            {documents.map((document, documentIndex) => (
              <article className="mobile-doc-capture__document" key={document.id}>
                <div className="mobile-doc-capture__document-head">
                  <div>
                    <strong>Document {documentIndex + 1}</strong>
                    <span>{document.pages.length} page{document.pages.length === 1 ? '' : 's'}</span>
                  </div>
                  {document.autoGrouped ? <em className="mobile-doc-capture__badge">Multi-page detected</em> : null}
                  {document.continuationFromPrevious ? (
                    <button type="button" className="mobile-doc-capture__suggestion" onClick={() => setDocuments((current) => mergeWithPrevious(current, documentIndex))}>
                      Possible continuation · Merge
                    </button>
                  ) : null}
                </div>

                <div className="mobile-doc-capture__pages">
                  {document.pages.map((page, pageIndex) => (
                    <div className={`mobile-doc-capture__page${page.quality.passed ? '' : ' is-failed'}`} key={page.id}>
                      <img src={page.previewUrl} alt={`Document ${documentIndex + 1}, page ${pageIndex + 1}`} />
                      <span>{pageIndex === 0 ? 'Page 1 · First page' : `Page ${pageIndex + 1}`}</span>
                      {!page.quality.passed ? (
                        <div className="mobile-doc-capture__quality-fail">
                          {page.quality.failures.map((failure) => <small key={failure}>{qualityFailureText(failure)}</small>)}
                          <button type="button" onClick={() => void retakePage(documentIndex, pageIndex)}>Retake</button>
                        </div>
                      ) : null}
                      {pageIndex > 0 ? (
                        <button
                          type="button"
                          className="mobile-doc-capture__page-boundary"
                          onClick={() => setDocuments((current) => startNewDocumentAtPage(current, documentIndex, pageIndex))}
                        >
                          Start new document here
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mobile-doc-capture__document-actions">
                  {documentIndex > 0 ? (
                    <button type="button" onClick={() => setDocuments((current) => mergeWithPrevious(current, documentIndex))}>
                      Merge with previous
                    </button>
                  ) : null}
                  {document.pages.length === 1 ? (
                    <button
                      type="button"
                      onClick={() => setSplitTarget({ documentIndex, pageIndex: 0, direction: 'HORIZONTAL', percent: 50 })}
                    >
                      Split page into 2 documents
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="mobile-doc-capture__footer-actions is-sticky">
            <button type="button" className="mobile-doc-capture__secondary" onClick={() => void beginScanner(true)}>Scan more</button>
            <button
              type="button"
              className="mobile-doc-capture__primary"
              disabled={!documents.length || invalidPageCount > 0}
              onClick={() => void packageAndHandoff()}
            >
              Upload {documents.length} document{documents.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      ) : null}

      {splitTarget ? (
        <div className="mobile-doc-capture__split" role="dialog" aria-modal="true" aria-label="Split scanned page">
          <div className="mobile-doc-capture__split-card">
            <header><strong>Split into two documents</strong><button type="button" onClick={() => setSplitTarget(undefined)}>×</button></header>
            <div className="mobile-doc-capture__split-preview">
              <img src={documents[splitTarget.documentIndex]?.pages[splitTarget.pageIndex]?.previewUrl} alt="Page to split" />
              <i
                className={splitTarget.direction === 'HORIZONTAL' ? 'is-horizontal' : 'is-vertical'}
                style={splitTarget.direction === 'HORIZONTAL' ? { top: `${splitTarget.percent}%` } : { left: `${splitTarget.percent}%` }}
              />
            </div>
            <div className="mobile-doc-capture__split-direction">
              <button type="button" className={splitTarget.direction === 'HORIZONTAL' ? 'is-active' : ''} onClick={() => setSplitTarget((current) => current ? { ...current, direction: 'HORIZONTAL' } : current)}>Top / bottom</button>
              <button type="button" className={splitTarget.direction === 'VERTICAL' ? 'is-active' : ''} onClick={() => setSplitTarget((current) => current ? { ...current, direction: 'VERTICAL' } : current)}>Left / right</button>
            </div>
            <label>
              Split position
              <input type="range" min={30} max={70} value={splitTarget.percent} onChange={(event) => setSplitTarget((current) => current ? { ...current, percent: Number(event.currentTarget.value) } : current)} />
            </label>
            <div className="mobile-doc-capture__footer-actions">
              <button type="button" className="mobile-doc-capture__secondary" onClick={() => setSplitTarget(undefined)}>Cancel</button>
              <button type="button" className="mobile-doc-capture__primary" onClick={() => void confirmSplit()}>Create 2 documents</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
