import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type NormalizedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

interface OptimizedPdfPageReviewProps {
  sourceUrl: string;
  pageNumber: number;
  box: NormalizedBox | null;
  label?: string | null;
  attention?: boolean;
  rangeCapable?: boolean;
  onFirstRenderSettled?: () => void;
}

export function OptimizedPdfPageReview({
  sourceUrl,
  pageNumber,
  box,
  label,
  attention = false,
  rangeCapable = false,
  onFirstRenderSettled,
}: OptimizedPdfPageReviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settledRef = useRef(false);
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const [renderedPage, setRenderedPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const notifySettled = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onFirstRenderSettled?.();
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setHostWidth(host.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    settledRef.current = false;
    let cancelled = false;
    const task = getDocument({
      url: sourceUrl,
      withCredentials: false,
      rangeChunkSize: 64 * 1024,
      // When R2 honors byte ranges, avoid streaming/prefetching the entire PDF.
      // This gives page 1 priority and prevents later documents competing for
      // bandwidth before the current preview is visible.
      disableStream: rangeCapable,
      disableAutoFetch: rangeCapable,
    });
    setDocumentProxy(null);
    setPageCount(0);
    setLoading(true);
    setError(null);

    void task.promise
      .then((pdf) => {
        if (cancelled) return;
        setDocumentProxy(pdf);
        setPageCount(pdf.numPages);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to render PDF.');
          setLoading(false);
          notifySettled();
        }
      });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [rangeCapable, sourceUrl]);

  useEffect(() => {
    if (!documentProxy || hostWidth <= 0) return undefined;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    const render = async () => {
      try {
        setLoading(true);
        setError(null);
        const targetPage = Math.max(1, Math.min(documentProxy.numPages, pageNumber || 1));
        const page = await documentProxy.getPage(targetPage);
        if (cancelled) return;

        const natural = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(260, hostWidth - 28);
        const cssScale = availableWidth / natural.width;
        const viewport = page.getViewport({ scale: cssScale });
        const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext('2d');
        if (!context) throw new Error('PDF canvas is not available.');

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) {
          setRenderedPage(targetPage);
          setLoading(false);
          notifySettled();
        }
      } catch (cause: unknown) {
        if (!cancelled && (cause as { name?: string })?.name !== 'RenderingCancelledException') {
          setError(cause instanceof Error ? cause.message : 'Unable to render PDF page.');
          setLoading(false);
          notifySettled();
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, hostWidth, pageNumber]);

  return (
    <div ref={hostRef} className="uc03-docverify-pdf-renderer">
      <div className="uc03-docverify-pdf-page">
        <canvas ref={canvasRef} aria-label={`PDF page ${renderedPage}`} />
        {box && renderedPage === Math.max(1, pageNumber || 1) ? (
          <div
            className={`uc03-docverify-highlight ${attention ? 'is-attention' : ''}`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
            aria-label={label ? `Source location for ${label}` : 'Source location'}
          >
            {label ? <span>{label}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="uc03-docverify-pdf-status" aria-live="polite">
        {loading ? 'Rendering PDF…' : error ? error : `Page ${renderedPage}${pageCount ? ` of ${pageCount}` : ''}`}
      </div>
    </div>
  );
}
