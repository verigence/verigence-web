import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { Tone } from './p2Format';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type NormalizedBox = { x: number; y: number; w: number; h: number };

export type PreviewBox = {
  id: string;
  page: number;
  box: NormalizedBox;
  label: string;
  tone: Tone;
};

/** DI's NORMALIZED_1000 [ymin, xmin, ymax, xmax] box, or null. Never invents a box. */
export function evidenceBox(region: Record<string, unknown> | null | undefined): NormalizedBox | null {
  if (!region || region.type !== 'BOX_2D' || region.coordinateSystem !== 'NORMALIZED_1000') return null;
  const raw = region.box;
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((value) => typeof value === 'number')) return null;
  const [ymin, xmin, ymax, xmax] = raw as number[];
  if ([ymin, xmin, ymax, xmax].some((value) => value < 0 || value > 1000)) return null;
  if (xmax <= xmin || ymax <= ymin) return null;
  return { x: xmin / 1000, y: ymin / 1000, w: (xmax - xmin) / 1000, h: (ymax - ymin) / 1000 };
}

function Boxes({
  boxes,
  selectedId,
  onSelect,
  selectedRef,
}: {
  boxes: PreviewBox[];
  selectedId?: string;
  onSelect: (id: string) => void;
  selectedRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      {boxes.map((item) => {
        const selected = item.id === selectedId;
        return (
          <button
            key={item.id}
            ref={selected ? selectedRef : undefined}
            type="button"
            className={`p2w-box p2w-box--${item.tone}${selected ? ' is-selected' : ''}`}
            style={{
              left: `${item.box.x * 100}%`,
              top: `${item.box.y * 100}%`,
              width: `${item.box.w * 100}%`,
              height: `${item.box.h * 100}%`,
            }}
            aria-label={`${item.label} on page`}
            aria-pressed={selected}
            onClick={() => onSelect(item.id)}
          >
            {selected ? <span>{item.label}</span> : null}
          </button>
        );
      })}
    </>
  );
}

export default function P2PagePreview({
  sourceUrl,
  isPdf,
  boxes,
  selectedId,
  onSelect,
  page,
  onPageChange,
}: {
  sourceUrl: string;
  isPdf: boolean;
  boxes: PreviewBox[];
  selectedId?: string;
  onSelect: (id: string) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [rendering, setRendering] = useState(isPdf);
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setWidth(host.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPdf) return undefined;
    let cancelled = false;
    const task = getDocument({ url: sourceUrl });
    setPdf(null);
    setError(undefined);
    void task.promise
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      })
      .catch(() => !cancelled && setError('The document preview could not be opened.'));
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [isPdf, sourceUrl]);

  useEffect(() => {
    if (!pdf || width <= 0) return undefined;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const render = async () => {
      try {
        setRendering(true);
        const target = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, page)));
        if (cancelled) return;
        const natural = target.getViewport({ scale: 1 });
        const viewport = target.getViewport({ scale: (Math.max(240, width) * zoom) / natural.width });
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = target.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (!cancelled) setRendering(false);
      } catch (cause) {
        if (!cancelled && (cause as { name?: string })?.name !== 'RenderingCancelledException') {
          setError('This page could not be rendered.');
          setRendering(false);
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, width, page, zoom]);

  useEffect(() => {
    if (rendering || !selectedRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      selectedRef.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rendering, selectedId, page]);

  const pageBoxes = boxes.filter((item) => item.page === page);

  return (
    <div className="p2w-preview">
      <div ref={hostRef} className="p2w-preview__stage">
        {error ? <div className="p2w-preview__message">{error}</div> : null}
        {isPdf ? (
          <div className="p2w-preview__page">
            <canvas ref={canvasRef} aria-label={`Page ${page}`} />
            {!rendering ? <Boxes boxes={pageBoxes} selectedId={selectedId} onSelect={onSelect} selectedRef={selectedRef} /> : null}
          </div>
        ) : (
          <div className="p2w-preview__page" style={{ width: `${zoom * 100}%` }}>
            <img src={sourceUrl} alt="Uploaded document" onLoad={() => setRendering(false)} />
            <Boxes boxes={pageBoxes} selectedId={selectedId} onSelect={onSelect} selectedRef={selectedRef} />
          </div>
        )}
      </div>
      <div className="p2w-preview__pager">
        {pageCount > 1 ? (
          <>
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">‹</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="Next page">›</button>
          </>
        ) : <span>Page 1</span>}
        <span className="p2w-preview__zoom" role="group" aria-label="Zoom">
          <button type="button" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Zoom in">+</button>
        </span>
      </div>
    </div>
  );
}
