import { useEffect } from 'react';

const OVERLAY_ATTR = 'data-di-field-viewer-overlay';

function closeViewer(): void {
  const overlay = document.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`);
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

function openViewer(run: HTMLElement): void {
  const tableWrap = run.querySelector<HTMLElement>('.di-test-field-table-wrap');
  if (!tableWrap) return;

  closeViewer();

  const documentLabel = run.querySelector<HTMLElement>('.di-test-run__head strong')?.textContent?.trim() || 'DI document';
  const fileName = run.querySelector<HTMLElement>('.di-test-run__head span')?.textContent?.trim() || '';
  const rows = tableWrap.querySelectorAll('tbody tr').length;

  const overlay = document.createElement('div');
  overlay.setAttribute(OVERLAY_ATTR, 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${documentLabel} extracted fields`);
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483000',
    'background:rgba(6,43,99,.52)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
  ].join(';');

  const panel = document.createElement('section');
  panel.style.cssText = [
    'width:min(1180px,96vw)',
    'max-height:88vh',
    'overflow:auto',
    'background:#fff',
    'border:1px solid #d8e2ee',
    'border-radius:16px',
    'box-shadow:0 24px 80px rgba(6,43,99,.28)',
    'padding:20px',
  ].join(';');

  const header = document.createElement('header');
  header.style.cssText = [
    'position:sticky',
    'top:-20px',
    'z-index:2',
    'display:flex',
    'align-items:flex-start',
    'justify-content:space-between',
    'gap:18px',
    'margin:-20px -20px 18px',
    'padding:18px 20px',
    'background:#fff',
    'border-bottom:1px solid #d8e2ee',
  ].join(';');

  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = `${documentLabel} — Extracted Fields`;
  title.style.cssText = 'margin:0 0 4px;color:#062b63;font-size:20px';
  const subtitle = document.createElement('p');
  subtitle.textContent = `${fileName}${fileName ? ' · ' : ''}${rows} fields returned by DI /fields`;
  subtitle.style.cssText = 'margin:0;color:#7086a3;font-size:12px';
  copy.append(title, subtitle);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = [
    'min-height:34px',
    'padding:0 12px',
    'border:1px solid #c5d4e3',
    'border-radius:8px',
    'background:#fff',
    'color:#062b63',
    'font-weight:750',
    'cursor:pointer',
  ].join(';');
  close.addEventListener('click', closeViewer);

  header.append(copy, close);
  panel.append(header, tableWrap.cloneNode(true));
  overlay.append(panel);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeViewer();
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  close.focus();
}

export default function DiFieldViewerEnhancer() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!window.location.pathname.startsWith('/admin/di-test')) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('button');
      if (!button || !button.textContent?.trim().startsWith('View fields (')) return;
      const run = button.closest<HTMLElement>('.di-test-run');
      if (!run) return;
      openViewer(run);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      closeViewer();
    };
  }, []);

  return null;
}
