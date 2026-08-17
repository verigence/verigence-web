import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadEvidenceRegister } from '../services/webRepository';

export default function EvidencePage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const query = useQuery({ queryKey: ['evidence-register'], queryFn: loadEvidenceRegister });
  const items = useMemo(() => (query.data?.items || []).filter((item) => {
    if (status !== 'ALL' && (item.verificationStatus || item.processingStatus) !== status) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [item.documentTypeKey, item.evidencePurpose, item.filename].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  }), [query.data, search, status]);

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Evidence register" title="Source evidence" description="Documents and screenshots remain the audit source. Open an item to inspect extracted facts and verification status." backing={query.data?.backing} />
      <SectionCard>
        <div className="toolbar-row toolbar-row--wrap">
          <label className="search-box"><span>Search evidence</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Document type, purpose or filename" /></label>
          <label className="filter-select"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All</option><option value="VERIFIED">Verified</option><option value="REVIEW_REQUIRED">Review required</option><option value="NOT_VERIFIED">Not verified</option><option value="READY">Ready</option><option value="PROCESSING">Processing</option></select></label>
          <span className="toolbar-count">{items.length} items</span>
        </div>
        <div className="evidence-card-grid">
          {items.map((item) => (
            <Link className="evidence-register-card" key={item.evidenceId} to={`/journeys/${item.journeyId}/evidence/${item.evidenceId}`}>
              <div className="evidence-register-card__top"><span className="document-mark">DOC</span><StatusPill value={item.verificationStatus || item.processingStatus} compact /></div>
              <strong>{item.documentTypeKey || 'Evidence document'}</strong>
              <span>{item.evidencePurpose}</span>
              <small>{item.filename || item.evidenceId}</small>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
