import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import StatusPill from '../../components/StatusPill';
import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  confirmMahindraMasterImport,
  downloadMahindraDiscountPolicyTemplate,
  downloadMahindraSegmentTemplate,
  publishMahindraMasterImport,
  type MahindraMasterImport,
  type Uc02ProjectSegment,
} from '../../services/audit-core/uc02Admin';
import {
  downloadMahindraValidationReport,
  listMahindraMasterImports,
  uploadMahindraNativeDiscountPolicy,
  uploadMahindraNativeSegmentMaster,
} from '../../services/audit-core/mahindraMasterState';
import {
  listMasterImportRows,
  type MasterImportRow,
} from '../../services/audit-core/uc02MasterImports';
import { useSessionStore } from '../../store/sessionStore';

interface MahindraMasterUploadsProps {
  tenantId: string;
  segments: Uc02ProjectSegment[];
  onError: (message: string) => void;
}

type UploadTarget =
  | { key: string; kind: 'SEGMENT'; segment: Uc02ProjectSegment; label: string }
  | { key: 'DISCOUNT_POLICY'; kind: 'DISCOUNT'; label: string };

type ImportMap = Record<string, MahindraMasterImport>;
type RowMap = Record<string, MasterImportRow[]>;

function randomKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function keyForImport(item: MahindraMasterImport): string | null {
  if (item.masterKey === 'DISCOUNT_POLICY') return 'DISCOUNT_POLICY';
  if (item.masterKey === 'MAHINDRA_SEGMENT_MASTER' && item.segmentId) {
    return `SEGMENT:${item.segmentId}`;
  }
  return null;
}

function validationLabel(item: MahindraMasterImport) {
  return item.errorRows > 0 || item.status === 'VALIDATION_FAILED'
    ? 'VALIDATION FAILED'
    : 'VALIDATION PASSED';
}

export default function MahindraMasterUploads({
  tenantId,
  segments,
  onError,
}: MahindraMasterUploadsProps) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const onErrorRef = useRef(onError);
  const restoreSequence = useRef(0);
  onErrorRef.current = onError;
  const targets = useMemo<UploadTarget[]>(
    () => [
      ...segments.map((segment) => ({
        key: `SEGMENT:${segment.segmentId}`,
        kind: 'SEGMENT' as const,
        segment,
        label: segment.segmentName.endsWith('Vehicle')
          ? `${segment.segmentName} & Price Master`
          : `${segment.segmentName} Vehicle & Price Master`,
      })),
      { key: 'DISCOUNT_POLICY' as const, kind: 'DISCOUNT' as const, label: 'Discount & Policy Master' },
    ],
    [segments],
  );
  const [activeKey, setActiveKey] = useState(targets[0]?.key || 'DISCOUNT_POLICY');
  const [file, setFile] = useState<File | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [importsByKey, setImportsByKey] = useState<ImportMap>({});
  const [rowsByKey, setRowsByKey] = useState<RowMap>({});
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!targets.some((target) => target.key === activeKey)) {
      setActiveKey(targets[0]?.key || 'DISCOUNT_POLICY');
    }
  }, [activeKey, targets]);

  useEffect(() => {
    if (!accessToken) {
      setImportsByKey({});
      setRowsByKey({});
      setRestoring(false);
      return;
    }

    const requestId = ++restoreSequence.current;
    let cancelled = false;
    let settled = false;

    // The backend is authoritative. Never display a previous Project/Tenant's
    // master state while a fresh restore is in flight.
    setImportsByKey({});
    setRowsByKey({});
    setRestoring(true);

    const timeoutId = window.setTimeout(() => {
      if (cancelled || settled || requestId !== restoreSequence.current) return;
      settled = true;
      setRestoring(false);
      onErrorRef.current(
        'Loading Project Masters timed out. Please retry; no stale browser state has been kept.',
      );
    }, 8000);

    void listMahindraMasterImports(tenantId, accessToken)
      .then((items) => {
        if (cancelled || settled || requestId !== restoreSequence.current) return;
        const next: ImportMap = {};
        for (const item of items) {
          const key = keyForImport(item);
          if (key) next[key] = item;
        }
        setImportsByKey(next);
        setRowsByKey({});
      })
      .catch((error) => {
        if (cancelled || settled || requestId !== restoreSequence.current) return;
        setImportsByKey({});
        setRowsByKey({});
        onErrorRef.current(auditCoreErrorMessage(error));
      })
      .finally(() => {
        if (cancelled || requestId !== restoreSequence.current) return;
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          setRestoring(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, tenantId]);

  const activeTarget = targets.find((target) => target.key === activeKey) || targets[0];
  const masterImport = importsByKey[activeKey] || null;
  const rows = rowsByKey[activeKey] || [];

  useEffect(() => {
    if (!accessToken || !masterImport || rowsByKey[activeKey]) return;
    if (masterImport.errorRows === 0) {
      setRowsByKey((current) => ({ ...current, [activeKey]: [] }));
      return;
    }
    let cancelled = false;
    void listMasterImportRows(tenantId, masterImport.importId, 'ERROR', accessToken)
      .then((page) => {
        if (!cancelled) {
          setRowsByKey((current) => ({ ...current, [activeKey]: page.items }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          // The import summary is authoritative. A secondary preview failure must
          // never be reported as an upload failure.
          setRowsByKey((current) => ({ ...current, [activeKey]: [] }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeKey, masterImport, rowsByKey, tenantId]);

  function changeTarget(key: string) {
    setActiveKey(key);
    setFile(null);
    setFileInputVersion((value) => value + 1);
    setEffectiveFrom('');
    setNotice('');
  }

  function rememberImport(key: string, imported: MahindraMasterImport) {
    setImportsByKey((current) => ({ ...current, [key]: imported }));
  }

  async function getTemplate() {
    if (!accessToken || !activeTarget) return;
    setBusy(true);
    setNotice('');
    try {
      if (activeTarget.kind === 'SEGMENT') {
        const blob = await downloadMahindraSegmentTemplate(
          tenantId,
          activeTarget.segment.segmentId,
          accessToken,
        );
        triggerBlob(blob, `mahindra-${activeTarget.segment.segmentCode.toLowerCase()}-vehicle-price.xlsx`);
      } else {
        const blob = await downloadMahindraDiscountPolicyTemplate(tenantId, accessToken);
        triggerBlob(blob, 'mahindra-discount-policy.xlsx');
      }
    } catch (error) {
      onErrorRef.current(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !activeTarget || !file) return;
    setBusy(true);
    setNotice('');
    try {
      const imported = activeTarget.kind === 'SEGMENT'
        ? await uploadMahindraNativeSegmentMaster(
            tenantId,
            activeTarget.segment.segmentId,
            file,
            effectiveFrom || null,
            randomKey('mahindra-segment-master'),
            accessToken,
          )
        : await uploadMahindraNativeDiscountPolicy(
            tenantId,
            file,
            effectiveFrom || null,
            randomKey('mahindra-discount-policy'),
            accessToken,
          );
      rememberImport(activeKey, imported);
      setRowsByKey((current) => ({ ...current, [activeKey]: [] }));
      setNotice(
        imported.errorRows === 0
          ? `Validation PASSED. ${imported.validRows} rows are valid. Review and confirm this import.`
          : `Validation FAILED. ${imported.errorRows} rows contain blocking errors.`,
      );
      setFile(null);
      setFileInputVersion((value) => value + 1);
      setEffectiveFrom('');

      if (imported.errorRows > 0) {
        try {
          const page = await listMasterImportRows(tenantId, imported.importId, 'ERROR', accessToken);
          setRowsByKey((current) => ({ ...current, [activeKey]: page.items }));
        } catch {
          // Validation status/counts are already persisted and displayed above.
          // Keep a successful upload successful even when row preview is unavailable.
        }
      }
    } catch (error) {
      onErrorRef.current(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!accessToken || !masterImport) return;
    setBusy(true);
    setNotice('');
    try {
      const confirmed = await confirmMahindraMasterImport(tenantId, masterImport.importId, accessToken);
      rememberImport(activeKey, confirmed);
      setNotice('Import confirmed. The validated master is DRAFT and ready to publish.');
    } catch (error) {
      onErrorRef.current(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function publishImport() {
    if (!accessToken || !masterImport) return;
    setBusy(true);
    setNotice('');
    try {
      const published = await publishMahindraMasterImport(tenantId, masterImport.importId, accessToken);
      rememberImport(activeKey, published);
      setNotice('Master published successfully.');
    } catch (error) {
      onErrorRef.current(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function validationReport() {
    if (!accessToken || !masterImport) return;
    try {
      const blob = await downloadMahindraValidationReport(tenantId, masterImport.importId, accessToken);
      triggerBlob(blob, `${masterImport.masterKey.toLowerCase()}-${masterImport.importId}-validation.xlsx`);
    } catch (error) {
      onErrorRef.current(auditCoreErrorMessage(error));
    }
  }

  if (!activeTarget) return null;

  return (
    <div className="uc02-master-layout">
      <aside className="uc02-card uc02-master-list uc02-master-list--mahindra">
        <div className="uc02-card__title">
          <h3>Mahindra Masters</h3>
          <p>Each selected Segment keeps its own upload and validation state.</p>
        </div>
        {targets.map((target) => {
          const existing = importsByKey[target.key];
          return (
            <button
              key={target.key}
              type="button"
              className={`uc02-master-list__item${activeKey === target.key ? ' active' : ''}`}
              onClick={() => changeTarget(target.key)}
            >
              <span>
                <strong>{target.label}</strong>
                <small>
                  {target.kind === 'SEGMENT'
                    ? `${target.segment.segmentCode.replaceAll('_', ' ')} · Product + dynamic pricing`
                    : 'Booking, commercial and trade-in rule parameters'}
                </small>
                {existing && (
                  <small>
                    {existing.fileName} · {existing.lifecycleStatus || existing.status} · WEF {existing.effectiveFrom}
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </aside>

      <div className="uc02-card uc02-card--wide">
        <div className="uc02-card__title">
          <h3>{activeTarget.label}</h3>
          <p>
            {activeTarget.kind === 'SEGMENT'
              ? 'Upload the original OEM workbook. Verigence reads the vehicle configuration, dynamic price components and workbook WEF; no predefined price lines are required.'
              : 'Upload the OEM Discount & Policy workbook. Booking, commercial and trade-in parameters are validated before confirmation.'}
          </p>
        </div>

        <div className="uc02-master-actions">
          <button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>
            Get Excel Template
          </button>
        </div>

        {restoring && <div className="uc02-note">Loading previously uploaded master status…</div>}

        <form className="uc02-master-upload" onSubmit={submitUpload}>
          <label className="uc02-field">
            <span>Completed Workbook</span>
            <input
              key={`${activeKey}:${fileInputVersion}`}
              type="file"
              accept=".xlsx"
              required
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="uc02-field">
            <span>Effective From <small>(optional)</small></span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
            <small>Leave blank when the OEM workbook contains its own WEF.</small>
          </label>
          <button className="uc02-button uc02-button--primary" disabled={busy || !file}>
            {busy ? 'Validating…' : 'Upload & Validate'}
          </button>
        </form>

        {notice && <div className="uc02-note">{notice}</div>}

        {masterImport && (
          <>
            <div className="uc02-note">
              <strong>{validationLabel(masterImport)}</strong>
              {' · '}File: {masterImport.fileName}
              {' · '}WEF: {masterImport.effectiveFrom}
              {' · '}Import Reference: {masterImport.importId}
            </div>
            <div className="uc02-import-summary">
              <div><span>Status</span><StatusPill value={masterImport.lifecycleStatus || masterImport.status} /></div>
              <div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div>
              <div><span>Valid</span><strong>{masterImport.validRows}</strong></div>
              <div><span>Errors</span><strong>{masterImport.errorRows}</strong></div>
            </div>
          </>
        )}

        {rows.length > 0 && (
          <div className="uc02-table-wrap">
            <table className="uc02-table">
              <thead><tr><th>Row</th><th>Status</th><th>Messages</th></tr></thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td><StatusPill value={row.validationStatus} compact /></td>
                    <td>{row.messages.join(' · ') || 'Validated'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {masterImport && (
          <div className="uc02-actions">
            <button className="uc02-button" type="button" onClick={() => void validationReport()} disabled={busy}>
              Validation Report
            </button>
            <button
              className="uc02-button uc02-button--primary"
              type="button"
              onClick={() => void confirmImport()}
              disabled={busy || masterImport.status !== 'PREVIEW_READY' || masterImport.errorRows > 0}
            >
              Confirm Import
            </button>
            <button
              className="uc02-button uc02-button--primary"
              type="button"
              onClick={() => void publishImport()}
              disabled={busy || masterImport.status !== 'CONFIRMED' || masterImport.lifecycleStatus === 'PUBLISHED'}
            >
              Publish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}