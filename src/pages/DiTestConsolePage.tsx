import { useEffect, useMemo, useState } from 'react';

import PageHeader from '../components/PageHeader';
import {
  DI_TEST_DOCUMENT_TYPES,
  analyseDiTestDocuments,
  createDiTestSubject,
  diHealth,
  diTestConfig,
  getDiTestDocument,
  getDiTestFields,
  isDiTestConsoleAvailable,
  uploadDiTestDocument,
  type DiAnalysis,
  type DiDocument,
  type DiField,
  type DiUploadResult,
} from '../services/di/testConsole';

type RunState = 'UPLOADING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'REJECTED' | 'ERROR';

type DocumentRun = {
  localId: string;
  fileName: string;
  documentTypeKey: string;
  documentTypeLabel: string;
  state: RunState;
  upload?: DiUploadResult;
  document?: DiDocument;
  fields: DiField[];
  error?: string;
};

const SUBJECT_STORAGE_KEY = `verigence.di-test.subject.${diTestConfig.tenantId}`;
const POLL_INTERVAL_MS = 3_000;
const POLL_ATTEMPTS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function statusClass(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export default function DiTestConsolePage() {
  const available = isDiTestConsoleAvailable();
  const [health, setHealth] = useState<'CHECKING' | 'READY' | 'UNAVAILABLE'>('CHECKING');
  const [subjectId, setSubjectId] = useState(() => window.localStorage.getItem(SUBJECT_STORAGE_KEY) ?? '');
  const [subjectName, setSubjectName] = useState('DI E2E Test Subject');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [documentTypeKey, setDocumentTypeKey] = useState('booking_form');
  const [customDocumentType, setCustomDocumentType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [runs, setRuns] = useState<DocumentRun[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState<DiAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (!available) {
      setHealth('UNAVAILABLE');
      return;
    }
    let active = true;
    void diHealth()
      .then(() => { if (active) setHealth('READY'); })
      .catch(() => { if (active) setHealth('UNAVAILABLE'); });
    return () => { active = false; };
  }, [available]);

  const effectiveDocumentTypeKey = documentTypeKey === '__custom__'
    ? customDocumentType.trim()
    : documentTypeKey;
  const selectedType = DI_TEST_DOCUMENT_TYPES.find((item) => item.key === documentTypeKey);
  const processedDocumentIds = useMemo(
    () => runs
      .filter((run) => run.document?.processingStatus === 'PROCESSED' && Boolean(run.document?.documentId))
      .map((run) => run.document?.documentId)
      .filter((value): value is string => Boolean(value)),
    [runs],
  );

  const updateRun = (localId: string, patch: Partial<DocumentRun>) => {
    setRuns((current) => current.map((run) => run.localId === localId ? { ...run, ...patch } : run));
  };

  const ensureSubject = async (): Promise<string> => {
    if (subjectId) return subjectId;
    setCreatingSubject(true);
    try {
      const subject = await createDiTestSubject(subjectName);
      setSubjectId(subject.subjectId);
      window.localStorage.setItem(SUBJECT_STORAGE_KEY, subject.subjectId);
      return subject.subjectId;
    } finally {
      setCreatingSubject(false);
    }
  };

  const createNewSubject = async () => {
    setPageError('');
    setAnalysis(null);
    setCreatingSubject(true);
    try {
      const subject = await createDiTestSubject(subjectName);
      setSubjectId(subject.subjectId);
      setRuns([]);
      window.localStorage.setItem(SUBJECT_STORAGE_KEY, subject.subjectId);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to create DI test subject.');
    } finally {
      setCreatingSubject(false);
    }
  };

  const pollDocument = async (runId: string, activeSubjectId: string, documentId: string) => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const document = await getDiTestDocument(activeSubjectId, documentId);
      const processingStatus = document.processingStatus ?? 'PENDING';
      updateRun(runId, {
        document,
        state: processingStatus === 'PROCESSED'
          ? 'PROCESSED'
          : processingStatus === 'FAILED'
            ? 'FAILED'
            : 'PROCESSING',
      });

      if (processingStatus === 'FAILED') return;
      if (processingStatus === 'PROCESSED') {
        if (document.confirmationStatus === 'CONFIRMED') {
          const fields = await getDiTestFields(activeSubjectId, documentId);
          updateRun(runId, { fields, state: 'PROCESSED' });
        } else {
          updateRun(runId, {
            state: 'PROCESSED',
            error: `Processing completed but confirmationStatus=${document.confirmationStatus ?? 'UNKNOWN'}; DI /fields is intentionally unavailable until CONFIRMED.`,
          });
        }
        return;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`DI processing did not finish within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000} seconds.`);
  };

  const uploadAndProcess = async () => {
    if (!file || !effectiveDocumentTypeKey || !available) return;
    setPageError('');
    setAnalysis(null);
    setUploading(true);
    const runId = crypto.randomUUID();
    const label = selectedType?.label || effectiveDocumentTypeKey;
    setRuns((current) => [{
      localId: runId,
      fileName: file.name,
      documentTypeKey: effectiveDocumentTypeKey,
      documentTypeLabel: label,
      state: 'UPLOADING',
      fields: [],
    }, ...current]);

    try {
      const activeSubjectId = await ensureSubject();
      const upload = await uploadDiTestDocument(activeSubjectId, effectiveDocumentTypeKey, file);
      if (upload.uploadStatus !== 'ACCEPTED' || (upload.errorCode && upload.errorCode !== '000')) {
        updateRun(runId, {
          upload,
          state: 'REJECTED',
          error: upload.errorMessage || `DI rejected upload with ${upload.errorCode || 'unknown error'}.`,
        });
        return;
      }
      updateRun(runId, { upload, state: 'PROCESSING' });
      await pollDocument(runId, activeSubjectId, upload.documentId);
    } catch (error) {
      updateRun(runId, {
        state: 'ERROR',
        error: error instanceof Error ? error.message : 'Unexpected DI test error.',
      });
    } finally {
      setUploading(false);
    }
  };

  const refreshRun = async (run: DocumentRun) => {
    const documentId = run.upload?.documentId || run.document?.documentId;
    if (!subjectId || !documentId) return;
    setPageError('');
    try {
      const document = await getDiTestDocument(subjectId, documentId);
      let fields = run.fields;
      if (document.processingStatus === 'PROCESSED' && document.confirmationStatus === 'CONFIRMED') {
        fields = await getDiTestFields(subjectId, documentId);
      }
      updateRun(run.localId, {
        document,
        fields,
        state: document.processingStatus === 'FAILED' ? 'FAILED' : document.processingStatus === 'PROCESSED' ? 'PROCESSED' : 'PROCESSING',
        error: undefined,
      });
    } catch (error) {
      updateRun(run.localId, { error: error instanceof Error ? error.message : 'Refresh failed.' });
    }
  };

  const runRules = async () => {
    if (processedDocumentIds.length === 0) return;
    setAnalysing(true);
    setPageError('');
    try {
      setAnalysis(await analyseDiTestDocuments(processedDocumentIds));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'DI rule analysis failed.');
    } finally {
      setAnalysing(false);
    }
  };

  if (!available) {
    return (
      <section className="di-test-page">
        <PageHeader eyebrow="Administration" title="DI Test Console" description="DEV-only Document Intelligence E2E test utility." />
        <div className="di-test-blocked">
          <strong>DI Test Console is disabled outside an approved DEV/local host.</strong>
          <span>Set VITE_ENABLE_DI_TEST_CONSOLE=true only for an explicitly approved non-production deployment.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="di-test-page" aria-label="DI Test Console">
      <PageHeader
        eyebrow="Administration · DEV Testing"
        title="DI Test Console"
        description="Upload the original document directly from your browser into the DEV DI API, wait for DI processing, and inspect only the values returned by DI."
      />

      <div className="di-test-warning">
        <strong>DEV TEST CONSOLE — NOT FOR PRODUCTION</strong>
        <span>No ChatGPT/OCR pre-processing, no manual field injection, and no browser correction of extracted values.</span>
      </div>

      <div className="di-test-context-grid">
        <div><span>DI API</span><strong>{diTestConfig.baseUrl}</strong></div>
        <div><span>Test Tenant</span><strong>{diTestConfig.tenantId}</strong></div>
        <div><span>DEV Actor</span><strong>{diTestConfig.actorId} · TENANT_ADMIN</strong></div>
        <div><span>DI Readiness</span><strong className={`di-test-health di-test-health--${health.toLowerCase()}`}>{health}</strong></div>
      </div>

      {pageError && <div className="di-test-message di-test-message--error">{pageError}</div>}

      <div className="di-test-layout">
        <section className="di-test-card">
          <div className="di-test-card__head">
            <div><span className="eyebrow">Step 1</span><h2>Test Subject</h2></div>
            <span className={`di-test-pill ${subjectId ? 'is-ready' : ''}`}>{subjectId ? 'READY' : 'NOT CREATED'}</span>
          </div>
          <label>
            <span>Subject name</span>
            <input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="DI E2E Test Subject" />
          </label>
          <div className="di-test-subject-id"><span>Subject ID</span><code>{subjectId || 'Will be created automatically on first upload'}</code></div>
          <button type="button" className="di-test-button" disabled={creatingSubject || health !== 'READY'} onClick={createNewSubject}>
            {creatingSubject ? 'Creating…' : 'Create New Test Subject'}
          </button>
        </section>

        <section className="di-test-card">
          <div className="di-test-card__head"><div><span className="eyebrow">Step 2</span><h2>Upload & Process</h2></div></div>
          <label>
            <span>Document type</span>
            <select value={documentTypeKey} onChange={(event) => setDocumentTypeKey(event.target.value)}>
              {DI_TEST_DOCUMENT_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.key}</option>)}
              <option value="__custom__">Other / custom documentTypeKey…</option>
            </select>
          </label>
          {documentTypeKey === '__custom__' && (
            <label>
              <span>Custom documentTypeKey</span>
              <input value={customDocumentType} onChange={(event) => setCustomDocumentType(event.target.value)} placeholder="document_type_key" />
            </label>
          )}
          <label className="di-test-file">
            <span>Original document</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/tiff" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'PDF, JPEG, PNG or TIFF. The selected file is sent directly to DI.'}</small>
          </label>
          <button
            type="button"
            className="di-test-button di-test-button--primary"
            disabled={uploading || health !== 'READY' || !file || !effectiveDocumentTypeKey}
            onClick={uploadAndProcess}
          >
            {uploading ? 'DI is processing…' : 'Upload to DI & Extract'}
          </button>
        </section>
      </div>

      <section className="di-test-card di-test-results">
        <div className="di-test-card__head">
          <div><span className="eyebrow">DI Output</span><h2>Uploaded Documents & Extracted Values</h2></div>
          <span className="di-test-pill">{runs.length} TEST{runs.length === 1 ? '' : 'S'}</span>
        </div>

        {runs.length === 0 && <div className="di-test-empty">No documents uploaded in this browser session yet.</div>}
        {runs.map((run) => {
          const documentId = run.document?.documentId || run.upload?.documentId;
          return (
            <article className="di-test-run" key={run.localId}>
              <div className="di-test-run__head">
                <div>
                  <strong>{run.documentTypeLabel}</strong>
                  <span>{run.fileName}</span>
                  <code>{documentId || 'Waiting for documentId…'}</code>
                </div>
                <div className="di-test-run__actions">
                  <span className={`di-test-state di-test-state--${statusClass(run.state)}`}>{run.state}</span>
                  {documentId && <button type="button" className="di-test-button di-test-button--small" onClick={() => refreshRun(run)}>Refresh from DI</button>}
                </div>
              </div>

              <div className="di-test-run__status">
                <div><span>Upload</span><strong>{run.document?.uploadStatus || run.upload?.uploadStatus || '—'}</strong></div>
                <div><span>Processing</span><strong>{run.document?.processingStatus || run.upload?.processingStatus || '—'}</strong></div>
                <div><span>Confirmation</span><strong>{run.document?.confirmationStatus || '—'}</strong></div>
                <div><span>Document confidence</span><strong>{run.document?.confidenceScore ?? '—'}</strong></div>
              </div>

              {run.error && <div className="di-test-message di-test-message--error">{run.error}</div>}

              <div className="di-test-field-section">
                <h3>Fetched values from DI /fields</h3>
                {run.fields.length === 0 ? (
                  <div className="di-test-empty di-test-empty--compact">No DI field values are available for this document yet.</div>
                ) : (
                  <div className="di-test-field-table-wrap">
                    <table className="di-test-field-table">
                      <thead><tr><th>Field</th><th>DI Value</th><th>Source</th><th>Confidence</th></tr></thead>
                      <tbody>
                        {run.fields.map((field) => (
                          <tr key={`${run.localId}-${field.canonicalFieldId}`}>
                            <td><strong>{field.fieldKey}</strong></td>
                            <td><code>{printable(field.currentValue)}</code></td>
                            <td>{field.valueSource || '—'}</td>
                            <td>{field.confidenceScore ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <details className="di-test-raw">
                <summary>Raw DI response</summary>
                <pre>{JSON.stringify({ upload: run.upload, document: run.document, fields: run.fields }, null, 2)}</pre>
              </details>
            </article>
          );
        })}
      </section>

      <section className="di-test-card">
        <div className="di-test-card__head">
          <div><span className="eyebrow">Step 3</span><h2>Rule Engine</h2></div>
          <span className="di-test-pill">{processedDocumentIds.length} PROCESSED DOCS</span>
        </div>
        <p className="di-test-help">Runs the DI <code>/analyse</code> API against all documents in this test session that reached <code>PROCESSED</code>. No values are inserted or corrected by the console.</p>
        <button type="button" className="di-test-button di-test-button--primary" disabled={analysing || processedDocumentIds.length === 0} onClick={runRules}>
          {analysing ? 'Running DI rules…' : 'Run DI Rule Verification'}
        </button>
        {analysis && <pre className="di-test-analysis">{JSON.stringify(analysis, null, 2)}</pre>}
      </section>
    </section>
  );
}
