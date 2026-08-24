import { useEffect } from 'react';

import { diTestConfig } from '../../services/di/testConsole';

const OVERLAY_ATTR = 'data-di-field-viewer-overlay';
const RECOVERY_ATTR = 'data-di-field-recovery';
const SUBJECT_STORAGE_KEY = `verigence.di-test.subject.${diTestConfig.tenantId}`;

type RecoveredDocument = {
  documentId: string;
  documentTypeKey: string | null;
  processingStatus: string | null;
  confirmationStatus: string | null;
  registeredAtUtc: string;
};

type RecoveredField = {
  fieldKey: string;
  currentValue: unknown;
  valueSource: string | null;
  confidenceScore: number | null;
};

type ApiEnvelope<T> = {
  errorCode?: string | null;
  errorMessage?: string | null;
  data?: T | null;
};

function closeViewer(): void {
  const overlay = document.querySelector<HTMLElement>(`[${OVERLAY_ATTR}]`);
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildFieldTable(fields: RecoveredField[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'di-test-field-table-wrap';
  const table = document.createElement('table');
  table.className = 'di-test-field-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Field', 'DI Value', 'Source', 'Confidence']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const field of fields) {
    const row = document.createElement('tr');
    const fieldCell = document.createElement('td');
    const fieldStrong = document.createElement('strong');
    fieldStrong.textContent = field.fieldKey;
    fieldCell.appendChild(fieldStrong);

    const valueCell = document.createElement('td');
    const valueCode = document.createElement('code');
    valueCode.textContent = printable(field.currentValue);
    valueCell.appendChild(valueCode);

    const sourceCell = document.createElement('td');
    sourceCell.textContent = field.valueSource || '—';
    const confidenceCell = document.createElement('td');
    confidenceCell.textContent = field.confidenceScore === null || field.confidenceScore === undefined
      ? '—'
      : String(field.confidenceScore);

    row.append(fieldCell, valueCell, sourceCell, confidenceCell);
    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

function showViewer(documentLabel: string, detail: string, tableWrap: HTMLElement): void {
  closeViewer();
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
  subtitle.textContent = `${detail}${detail ? ' · ' : ''}${rows} fields returned by DI /fields`;
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

function openViewer(run: HTMLElement): void {
  const tableWrap = run.querySelector<HTMLElement>('.di-test-field-table-wrap');
  if (!tableWrap) return;
  const documentLabel = run.querySelector<HTMLElement>('.di-test-run__head strong')?.textContent?.trim() || 'DI document';
  const fileName = run.querySelector<HTMLElement>('.di-test-run__head span')?.textContent?.trim() || '';
  showViewer(documentLabel, fileName, tableWrap);
}

async function recoverLatestConfirmed(): Promise<void> {
  const subjectId = window.localStorage.getItem(SUBJECT_STORAGE_KEY);
  if (!subjectId) throw new Error('No DI test Subject is stored in this browser yet.');

  const token = `mock.${diTestConfig.tenantId}.${diTestConfig.actorId}.TENANT_ADMIN`;
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  const subjectPath = `${diTestConfig.baseUrl}/v1/tenants/${encodeURIComponent(diTestConfig.tenantId)}/subjects/${encodeURIComponent(subjectId)}`;

  const listResponse = await fetch(`${subjectPath}/documents`, { headers, cache: 'no-store' });
  const listPayload = await listResponse.json() as ApiEnvelope<{ documents: RecoveredDocument[] }>;
  if (!listResponse.ok || (listPayload.errorCode && listPayload.errorCode !== '000')) {
    throw new Error(listPayload.errorMessage || `Unable to list DI documents (HTTP ${listResponse.status}).`);
  }

  const latest = (listPayload.data?.documents ?? [])
    .filter((doc) => doc.processingStatus === 'PROCESSED' && doc.confirmationStatus === 'CONFIRMED')
    .sort((left, right) => Date.parse(right.registeredAtUtc) - Date.parse(left.registeredAtUtc))[0];
  if (!latest) throw new Error('No PROCESSED + CONFIRMED DI document exists for this test Subject.');

  const fieldsResponse = await fetch(`${subjectPath}/documents/${encodeURIComponent(latest.documentId)}/fields`, {
    headers,
    cache: 'no-store',
  });
  const fieldsPayload = await fieldsResponse.json() as ApiEnvelope<{ fields: RecoveredField[] }>;
  if (!fieldsResponse.ok || (fieldsPayload.errorCode && fieldsPayload.errorCode !== '000')) {
    throw new Error(fieldsPayload.errorMessage || `Unable to fetch DI fields (HTTP ${fieldsResponse.status}).`);
  }

  const fields = fieldsPayload.data?.fields ?? [];
  if (fields.length === 0) throw new Error('DI returned zero current fields for the latest confirmed document.');
  showViewer(latest.documentTypeKey || 'DI document', `Recovered document ${latest.documentId}`, buildFieldTable(fields));
}

function mountRecoveryButton(): void {
  if (!window.location.pathname.startsWith('/admin/di-test')) return;
  if (document.querySelector(`[${RECOVERY_ATTR}]`)) return;
  const header = document.querySelector<HTMLElement>('.di-test-results > .di-test-card__head');
  if (!header) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(RECOVERY_ATTR, 'true');
  button.className = 'di-test-button di-test-button--small';
  button.textContent = 'Recover latest DI fields';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Recovering…';
    try {
      await recoverLatestConfirmed();
      button.textContent = 'Recover latest DI fields';
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : 'Recovery failed';
    } finally {
      button.disabled = false;
    }
  });
  header.appendChild(button);
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

    mountRecoveryButton();
    const observer = new MutationObserver(mountRecoveryButton);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      document.querySelector(`[${RECOVERY_ATTR}]`)?.remove();
      closeViewer();
    };
  }, []);

  return null;
}
