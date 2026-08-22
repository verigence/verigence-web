import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadEvidenceRegister } from '../services/webRepository';

function readableLabel(value?: string | null) {
  if (!value) return '';
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

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
      <PageHeader eyebrow="Evidence Register" title="Source Evidence" description="Find source documents and screenshots, then open an item to review its details and verification status." backing={query.data?.backing} />
      <SectionCard>
        <div className="toolbar-row toolbar-row--wrap">
          <label className="search-box"><span>Search Evidence</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Document type, purpose or filename" /></label>
          <label className="filter-select"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All</option><option value="VERIFIED">Verified</option><option value="REVIEW_REQUIRED">Review Required</option><option value="NOT_VERIFIED">Not Verified</option><option value="READY">Ready</option><option value="PROCESSING">Processing</option></select></label>
          <span className="toolbar-count">{items.length} items</span>
        </div>
        <div className="evidence-card-grid">
          {items.map((item) => (
            <Link className="evidence-register-card" key={item.evidenceId} to={`/journeys/${item.journeyId}/evidence/${item.evidenceId}`}>
              <div className="evidence-register-card__top"><span className="document-mark">DOC</span><StatusPill value={item.verificationStatus || item.processingStatus} compact /></div>
              <strong>{readableLabel(item.documentTypeKey) || 'Evidence Document'}</strong>
              <span>{readableLabel(item.evidencePurpose) || 'Supporting evidence'}</span>
              <small>{item.filename || 'File details unavailable'}</small>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
