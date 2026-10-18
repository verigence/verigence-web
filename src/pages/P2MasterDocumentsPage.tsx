import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  getP2MasterDocuments,
  openP2MasterDocument,
  type P2MasterDocument,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const KIND_LABELS: Record<string, string> = {
  PRICE_LIST: 'Price list',
  CONSUMER_SCHEME: 'Consumer scheme',
  EXCHANGE_SCHEME: 'Exchange / scrappage scheme',
  CORPORATE_POLICY: 'Corporate privilege policy',
  DISCOUNT_GRID: 'Dealer discount grid',
};

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function when(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-IN');
}

function Row({ document, onOpen, busy }: {
  document: P2MasterDocument;
  onOpen: (document: P2MasterDocument, download: boolean) => void;
  busy: boolean;
}) {
  const failed = document.status === 'FAILED';
  return (
    <tr>
      <td>
        <strong>{KIND_LABELS[document.masterKind] ?? document.masterKind}</strong>
        <div className="p2w-muted">{document.fileName}</div>
        {failed && document.errorDetail && (
          <div className="form-alert form-alert--error" style={{ marginTop: 6 }}>{document.errorDetail}</div>
        )}
      </td>
      <td>{document.effectiveFrom}</td>
      <td>{document.status}</td>
      <td>
        <div>{when(document.uploadedAtUtc)}</div>
        {document.uploadedBy && <div className="p2w-muted">{document.uploadedBy}</div>}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {document.openable ? (
          <>
            <button type="button" className="text-link" disabled={busy} onClick={() => onOpen(document, false)}>
              Open
            </button>
            {' · '}
            <button type="button" className="text-link" disabled={busy} onClick={() => onOpen(document, true)}>
              Download
            </button>
          </>
        ) : (
          <span className="p2w-muted" title="This document was uploaded before the file itself was kept.">
            Not stored
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * The OEM master documents a month's figures were read from, so anyone
 * working a deal can open the price list or scheme bulletin and check a
 * figure against the source.
 *
 * The month is the one each document is effective for, not when it was
 * uploaded — a grid named for August whose sheet says "Effective 1st Sep"
 * belongs to September.
 */
export default function P2MasterDocumentsPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [month, setMonth] = useState(thisMonth());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState('');

  const query = useQuery({
    queryKey: ['p2-master-documents', tenantId, month],
    queryFn: () => getP2MasterDocuments(tenantId!, month, accessToken),
    enabled: Boolean(tenantId && accessToken && month),
    staleTime: 30_000,
  });

  async function open(document: P2MasterDocument, download: boolean) {
    setProblem('');
    setBusyId(document.uploadId);
    try {
      const link = await openP2MasterDocument(tenantId!, document.uploadId, accessToken);
      if (download) {
        const anchor = window.document.createElement('a');
        anchor.href = link.url;
        anchor.download = link.fileName || document.fileName;
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setProblem(`${document.fileName} could not be opened.`);
    } finally {
      setBusyId(null);
    }
  }

  const documents = query.data?.documents ?? [];
  const missing = query.data?.missingKinds ?? [];

  return (
    <div className="screen-stack p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Master Documents"
        description="The OEM documents a month's prices and schemes were read from. Open or download any of them to check a figure against the source."
      />

      <SectionCard>
        <label>
          <span className="j360-label">Month</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <p className="p2w-muted" style={{ marginTop: 8 }}>
          A document is listed under the month it is effective for, not the day it was uploaded.
        </p>
        {problem && <div className="form-alert form-alert--error">{problem}</div>}
      </SectionCard>

      {missing.length > 0 && (
        <SectionCard>
          <strong>Nothing published this month for:</strong>
          <p className="p2w-muted">
            {missing.map((kind) => KIND_LABELS[kind] ?? kind).join(', ')}. Figures of that kind will fall
            back to an earlier month, or be absent.
          </p>
        </SectionCard>
      )}

      {query.isLoading && <SectionCard><p>Reading the month…</p></SectionCard>}
      {query.isError && (
        <SectionCard><div className="form-alert form-alert--error">The month could not be read.</div></SectionCard>
      )}
      {query.data && documents.length === 0 && (
        <SectionCard>
          <strong>No master documents for {month}</strong>
          <p className="p2w-muted">Nothing was loaded for this month. Figures will come from an earlier book.</p>
        </SectionCard>
      )}

      {documents.length > 0 && (
        <SectionCard>
          <div style={{ overflowX: 'auto' }}>
            <table className="p2w-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Effective</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <Row
                    key={document.uploadId}
                    document={document}
                    onOpen={open}
                    busy={busyId === document.uploadId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
