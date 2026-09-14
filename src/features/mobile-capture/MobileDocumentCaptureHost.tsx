import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { captureEvidencePhoto } from '../../services/device/camera';
import {
  ensureGoogleDocumentScanner,
  mobileDocumentScannerEligible,
  recognizeContinuationText,
  scanDocumentPageUris,
  scannerErrorWasCancellation,
} from '../../services/device/documentScanner';
import { reconcileUnifiedDocuments, uploadUnifiedCaptureFiles } from '../../services/audit-core/uc03UnifiedDocumentCapture';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
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
  MobileCaptureTarget,
  PageQualityFailureCode,
} from './types';
import '../../styles/mobile-document-capture.css';

type CapturePhase = 'IDLE' | 'PREPARING' | 'SCANNING' | 'PROCESSING' | 'REVIEW' | 'FALLBACK' | 'UPLOADING' | 'DONE';

interface SplitTarget {
  documentIndex: number;
  pageIndex: number;
  direction: PageSplitDirection;
  percent: number;
}

function captureTarget(pathname: string): MobileCaptureTarget | undefined {
  const booking = pathname.match(/^\/v2\/bookings\/(new|[^/]+)$/);
  if (booking) {
    return {
      stage: 'BOOKING',
      journeyId: booking[1] === 'new' ? undefined : booking[1],
      routePath: pathname,
    };
  }
  const delivery = pathname.match(/^\/v2\/deliveries\/([^/]+)$/);
  if (delivery) return { stage: 'DELIVERY', journeyId: delivery[1], routePath: pathname };
  return undefined;
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

function releaseBlobPreviews(documents: LogicalCapturedDocument[]): void {
  documents.forEach((document) => document.pages.forEach((page) => {
    if (page.sourceBlob && page.previewUrl.startsWith('blob:')) URL.revokeObjectURL(page.previewUrl);
  }));
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

async function waitForJourneyId(target: MobileCaptureTarget): Promise<string> {
  if (target.journeyId) return target.journeyId;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const match = window.location.pathname.match(/^\/v2\/bookings\/([^/]+)$/);
    if (match && match[1] !== 'new') return match[1];
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error('The Booking is not ready to receive documents yet.');
}

export default function MobileDocumentCaptureHost() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const target = useMemo(() => captureTarget(location.pathname), [location.pathname]);
  const eligible = mobileDocumentScannerEligible();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>('IDLE');
  const [documents, setDocuments] = useState<LogicalCapturedDocument[]>([]);
  const [fallbackPages, setFallbackPages] = useState<CapturedPage[]>([]);
  const [processing, setProcessing] = useState({ current: 0, total: 0 });
  const [moduleProgress, setModuleProgress] = useState<number>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [fallbackReason, setFallbackReason] = useState<string>();
  const [splitTarget, setSplitTarget] = useState<SplitTarget>();
  const [uploadedDocumentIds, setUploadedDocumentIds] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const autoOpenedRoute = useRef<string>();
  const launchInFlight = useRef(false);

  const clearSession = useCallback(() => {
    releaseBlobPreviews(documents);
    releaseBlobPreviews(buildInitialDocumentGroups(fallbackPages));
    setDocuments([]);
    setFallbackPages([]);
    setUploadedDocumentIds(new Set());
    setSplitTarget(undefined);
    setMessage(undefined);
    setError(undefined);
    setFallbackReason(undefined);
    setProcessing({ current: 0, total: 0 });
    setUploadProgress({ current: 0, total: 0 });
  }, [documents, fallbackPages]);

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

  const beginScanner = useCallback(async () => {
    if (!target || launchInFlight.current) return;
    launchInFlight.current = true;
    setOpen(true);
    setError(undefined);
    setMessage(undefined);
    setModuleProgress(undefined);
    setPhase('PREPARING');
    try {
      await ensureGoogleDocumentScanner((event) => setModuleProgress(event.progress));
      setPhase('SCANNING');
      const uris = await scanDocumentPageUris(20);
      if (!uris.length) {
        setPhase(documents.length ? 'REVIEW' : 'IDLE');
        setOpen(documents.length > 0);
        return;
      }
      await processUris(uris);
    } catch (cause) {
      if (scannerErrorWasCancellation(cause)) {
        setPhase(documents.length ? 'REVIEW' : 'IDLE');
        setOpen(documents.length > 0);
      } else {
        setFallbackReason(cause instanceof Error ? cause.message : 'The Google document scanner is unavailable on this phone.');
        setPhase('FALLBACK');
        setOpen(true);
      }
    } finally {
      launchInFlight.current = false;
    }
  }, [documents.length, processUris, target]);

  useEffect(() => {
    if (!eligible || !target) {
      document.documentElement.classList.remove('mobile-document-capture-route');
      if (open || documents.length || fallbackPages.length) {
        releaseBlobPreviews(documents);
        releaseBlobPreviews(buildInitialDocumentGroups(fallbackPages));
        setOpen(false);
        setPhase('IDLE');
        setDocuments([]);
        setFallbackPages([]);
        setUploadedDocumentIds(new Set());
      }
      return undefined;
    }

    document.documentElement.classList.add('mobile-document-capture-route');
    const routeKey = `${target.stage}:${target.routePath}`;
    if (autoOpenedRoute.current !== routeKey) {
      autoOpenedRoute.current = routeKey;
      const timer = window.setTimeout(() => void beginScanner(), 300);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [beginScanner, documents, eligible, fallbackPages, open, target]);

  useEffect(() => () => {
    document.documentElement.classList.remove('mobile-document-capture-route');
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
      setError(cause instanceof Error ? cause.message : 'The page could not be captured.');
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
      const replacement = await analyzedUriPage(uri, documents[documentIndex].pages[pageIndex].originalIndex);
      setDocuments((current) => current.map((document, d) => (
        d !== documentIndex
          ? document
          : { ...document, pages: document.pages.map((page, p) => (p === pageIndex ? replacement : page)) }
      )));
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
        if (original.pages[0].sourceBlob && original.pages[0].previewUrl.startsWith('blob:')) URL.revokeObjectURL(original.pages[0].previewUrl);
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

  const pendingDocuments = documents.filter((document) => !uploadedDocumentIds.has(document.id));
  const invalidPageCount = pendingDocuments.reduce(
    (total, document) => total + document.pages.filter((page) => !page.quality.passed).length,
    0,
  );

  const upload = async () => {
    if (!target || !project?.tenantId || !accessToken || !pendingDocuments.length || invalidPageCount > 0) return;
    setPhase('UPLOADING');
    setError(undefined);
    setMessage(undefined);
    setUploadProgress({ current: 0, total: pendingDocuments.length });
    try {
      const journeyId = await waitForJourneyId(target);
      const successful = new Set(uploadedDocumentIds);
      const failed: string[] = [];

      // One logical document per existing upload call. This intentionally
      // avoids the shared service's six-way fan-out on low-cost phones and
      // lets us know exactly which local document needs retry.
      for (let index = 0; index < pendingDocuments.length; index += 1) {
        const document = pendingDocuments[index];
        try {
          const file = await buildDocumentPdf(document, journeyId, documents.indexOf(document) + 1);
          const result = await uploadUnifiedCaptureFiles(project.tenantId, journeyId, [file], accessToken);
          if (result.uploaded === 1 && result.failed === 0) successful.add(document.id);
          else failed.push(document.id);
        } catch {
          failed.push(document.id);
        }
        setUploadedDocumentIds(new Set(successful));
        setUploadProgress({ current: index + 1, total: pendingDocuments.length });
      }

      if (successful.size > uploadedDocumentIds.size) {
        await reconcileUnifiedDocuments(project.tenantId, journeyId, accessToken).catch(() => undefined);
        await queryClient.invalidateQueries({
          predicate: (query) => query.queryKey.some((part) => part === journeyId),
        });
      }

      if (failed.length) {
        setPhase('REVIEW');
        setError(`${failed.length} document${failed.length === 1 ? '' : 's'} could not be uploaded. Successful documents will not be sent again; retry the remaining documents.`);
      } else {
        setPhase('DONE');
        setMessage(`${successful.size} document${successful.size === 1 ? '' : 's'} uploaded. Classification and extraction continue on the server.`);
      }
    } catch (cause) {
      setPhase('REVIEW');
      setError(cause instanceof Error ? cause.message : 'The captured documents could not be uploaded.');
    }
  };

  if (!eligible || !target) return null;

  const stageLabel = target.stage === 'BOOKING' ? 'Booking' : 'Delivery';
  const totalPages = countPages(documents);

  if (!open) {
    return (
      <button type="button" className="mobile-doc-capture-launcher" onClick={() => {
        if (documents.length) {
          setPhase('REVIEW');
          setOpen(true);
        } else void beginScanner();
      }}>
        <span aria-hidden="true">▣</span>
        {documents.length ? `Review ${documents.length} captured document${documents.length === 1 ? '' : 's'}` : `Scan ${stageLabel} documents`}
      </button>
    );
  }

  return (
    <section className="mobile-doc-capture" role="dialog" aria-modal="true" aria-label={`${stageLabel} document capture`}>
      <header className="mobile-doc-capture__header">
        <div>
          <span className="mobile-doc-capture__eyebrow">{stageLabel} · Mobile Capture</span>
          <h2>Scan documents</h2>
        </div>
        {phase !== 'UPLOADING' && phase !== 'PROCESSING' && phase !== 'SCANNING' ? (
          <button type="button" className="mobile-doc-capture__close" onClick={() => setOpen(false)} aria-label="Close document capture">×</button>
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
          <p>Page {Math.max(1, processing.current)} of {Math.max(1, processing.total)} · quality checks and lightweight continuation OCR.</p>
          <progress max={Math.max(1, processing.total)} value={processing.current} />
        </div>
      ) : null}

      {phase === 'FALLBACK' ? (
        <div className="mobile-doc-capture__fallback">
          <div className="mobile-doc-capture__alert is-warning">
            <strong>Using basic camera mode</strong>
            <span>{fallbackReason || 'The Google document scanner is unavailable on this handset.'}</span>
          </div>
          <p>Capture one page at a time. Every page still has to pass the same Verigence quality gate before upload.</p>
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

      {phase === 'REVIEW' || phase === 'UPLOADING' ? (
        <div className="mobile-doc-capture__review">
          <div className="mobile-doc-capture__summary">
            <div><strong>{documents.length}</strong><span>documents</span></div>
            <div><strong>{totalPages}</strong><span>pages</span></div>
            <div className={invalidPageCount ? 'is-bad' : 'is-good'}><strong>{invalidPageCount}</strong><span>pages to retake</span></div>
          </div>

          <p className="mobile-doc-capture__hint">
            Verigence assumes a new document unless local OCR finds strong continuation evidence. No document type is classified on the phone.
          </p>

          <div className="mobile-doc-capture__documents">
            {documents.map((document, documentIndex) => {
              const uploaded = uploadedDocumentIds.has(document.id);
              return (
                <article className={`mobile-doc-capture__document${uploaded ? ' is-uploaded' : ''}`} key={document.id}>
                  <div className="mobile-doc-capture__document-head">
                    <div>
                      <strong>Document {documentIndex + 1}</strong>
                      <span>{document.pages.length} page{document.pages.length === 1 ? '' : 's'}</span>
                    </div>
                    {uploaded ? <em className="mobile-doc-capture__badge is-good">Uploaded</em> : null}
                    {!uploaded && document.autoGrouped ? <em className="mobile-doc-capture__badge">Multi-page detected</em> : null}
                    {!uploaded && document.continuationFromPrevious ? (
                      <button type="button" className="mobile-doc-capture__suggestion" onClick={() => setDocuments((current) => mergeWithPrevious(current, documentIndex))}>
                        Possible continuation · Merge
                      </button>
                    ) : null}
                  </div>

                  <div className="mobile-doc-capture__pages">
                    {document.pages.map((page, pageIndex) => (
                      <div className={`mobile-doc-capture__page${page.quality.passed ? '' : ' is-failed'}`} key={page.id}>
                        <img src={page.previewUrl} alt={`Document ${documentIndex + 1}, page ${pageIndex + 1}`} />
                        <span>Page {pageIndex + 1}</span>
                        {!page.quality.passed ? (
                          <div className="mobile-doc-capture__quality-fail">
                            {page.quality.failures.map((failure) => <small key={failure}>{qualityFailureText(failure)}</small>)}
                            <button type="button" disabled={phase === 'UPLOADING'} onClick={() => void retakePage(documentIndex, pageIndex)}>Retake</button>
                          </div>
                        ) : null}
                        {!uploaded && pageIndex > 0 ? (
                          <button
                            type="button"
                            className="mobile-doc-capture__page-boundary"
                            disabled={phase === 'UPLOADING'}
                            onClick={() => setDocuments((current) => startNewDocumentAtPage(current, documentIndex, pageIndex))}
                          >
                            Start new document here
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {!uploaded ? (
                    <div className="mobile-doc-capture__document-actions">
                      {documentIndex > 0 ? (
                        <button type="button" disabled={phase === 'UPLOADING'} onClick={() => setDocuments((current) => mergeWithPrevious(current, documentIndex))}>
                          Merge with previous
                        </button>
                      ) : null}
                      {document.pages.length === 1 ? (
                        <button
                          type="button"
                          disabled={phase === 'UPLOADING'}
                          onClick={() => setSplitTarget({ documentIndex, pageIndex: 0, direction: 'HORIZONTAL', percent: 50 })}
                        >
                          Split page into 2 documents
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {phase === 'UPLOADING' ? (
            <div className="mobile-doc-capture__upload-progress">
              <strong>Uploading document {Math.max(1, uploadProgress.current)} of {Math.max(1, uploadProgress.total)}</strong>
              <progress max={Math.max(1, uploadProgress.total)} value={uploadProgress.current} />
            </div>
          ) : (
            <div className="mobile-doc-capture__footer-actions is-sticky">
              <button type="button" className="mobile-doc-capture__secondary" onClick={() => void beginScanner()}>Scan more</button>
              <button
                type="button"
                className="mobile-doc-capture__primary"
                disabled={!pendingDocuments.length || invalidPageCount > 0}
                onClick={() => void upload()}
              >
                {uploadedDocumentIds.size ? `Upload remaining ${pendingDocuments.length}` : `Upload ${documents.length} document${documents.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {phase === 'DONE' ? (
        <div className="mobile-doc-capture__state is-done">
          <div className="mobile-doc-capture__done-mark" aria-hidden="true">✓</div>
          <strong>Documents sent</strong>
          <p>{message}</p>
          <div className="mobile-doc-capture__footer-actions">
            <button type="button" className="mobile-doc-capture__secondary" onClick={() => {
              clearSession();
              setPhase('IDLE');
              void beginScanner();
            }}>Scan more documents</button>
            <button type="button" className="mobile-doc-capture__primary" onClick={() => {
              clearSession();
              setPhase('IDLE');
              setOpen(false);
            }}>Done</button>
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
