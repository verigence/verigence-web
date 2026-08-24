import { useEffect, useMemo, useState, type FormEvent } from 'react';

import StatusPill from '../../components/StatusPill';
import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  confirmMahindraMasterImport,
  downloadMahindraDiscountPolicyTemplate,
  downloadMahindraSegmentTemplate,
  publishMahindraMasterImport,
  uploadMahindraDiscountPolicy,
  uploadMahindraSegmentMaster,
  type MahindraMasterImport,
  type Uc02ProjectSegment,
} from '../../services/audit-core/uc02Admin';
import {
  downloadMasterImportErrorReport,
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

export default function MahindraMasterUploads({
  tenantId,
  segments,
  onError,
}: MahindraMasterUploadsProps) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const targets = useMemo<UploadTarget[]>(
    () => [
      ...segments.map((segment) => ({
        key: `SEGMENT:${segment.segmentId}`,
        kind: 'SEGMENT' as const,
        segment,
        label: `${segment.segmentName} Vehicle & Price Master`,
      })),
      { key: 'DISCOUNT_POLICY' as const, kind: 'DISCOUNT' as const, label: 'Discount & Policy Master' },
    ],
    [segments],
  );
  const [activeKey, setActiveKey] = useState(targets[0]?.key || 'DISCOUNT_POLICY');
  const [file, setFile] = useState<File | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [masterImport, setMasterImport] = useState<MahindraMasterImport | null>(null);
  const [rows, setRows] = useState<MasterImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!targets.some((target) => target.key === activeKey)) {
      setActiveKey(targets[0]?.key || 'DISCOUNT_POLICY');
    }
  }, [activeKey, targets]);

  const activeTarget = targets.find((target) => target.key === activeKey) || targets[0];

  function changeTarget(key: string) {
    setActiveKey(key);
    setFile(null);
    setEffectiveFrom('');
    setMasterImport(null);
    setRows([]);
    setNotice('');
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
        triggerBlob(
          blob,
          `mahindra-${activeTarget.segment.segmentCode.toLowerCase()}-vehicle-price.xlsx`,
        );
      } else {
        const blob = await downloadMahindraDiscountPolicyTemplate(tenantId, accessToken);
        triggerBlob(blob, 'mahindra-discount-policy.xlsx');
      }
    } catch (error) {
      onError(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !activeTarget || !file || !effectiveFrom) return;
    setBusy(true);
    setNotice('');
    try {
      const imported = activeTarget.kind === 'SEGMENT'
        ? await uploadMahindraSegmentMaster(
            tenantId,
            activeTarget.segment.segmentId,
            file,
            effectiveFrom,
            randomKey('mahindra-segment-master'),
            accessToken,
          )
        : await uploadMahindraDiscountPolicy(
            tenantId,
            file,
            effectiveFrom,
            randomKey('mahindra-discount-policy'),
            accessToken,
          );
      setMasterImport(imported);
      const page = await listMasterImportRows(tenantId, imported.importId, undefined, accessToken);
      setRows(page.items);
      setNotice(
        imported.status === 'PREVIEW_READY'
          ? 'Workbook validated. Review the preview before confirming.'
          : 'Workbook has validation errors. Correct them and upload again.',
      );
    } catch (error) {
      onError(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!accessToken || !masterImport) return;
    setBusy(true);
    setNotice('');
    try {
      const confirmed = await confirmMahindraMasterImport(
        tenantId,
        masterImport.importId,
        accessToken,
      );
      setMasterImport(confirmed);
      setNotice('Import confirmed. The new master version is DRAFT and ready to publish.');
    } catch (error) {
      onError(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function publishImport() {
    if (!accessToken || !masterImport) return;
    setBusy(true);
    setNotice('');
    try {
      const published = await publishMahindraMasterImport(
        tenantId,
        masterImport.importId,
        accessToken,
      );
      setMasterImport(published);
      setNotice('Master published successfully.');
    } catch (error) {
      onError(auditCoreErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function validationReport() {
    if (!accessToken || !masterImport) return;
    try {
      const blob = await downloadMasterImportErrorReport(
        tenantId,
        masterImport.importId,
        accessToken,
      );
      triggerBlob(blob, `${masterImport.masterKey.toLowerCase()}-${masterImport.importId}-validation.csv`);
    } catch (error) {
      onError(auditCoreErrorMessage(error));
    }
  }

  if (!activeTarget) return null;

  return (
    <div className="uc02-master-layout">
      <aside className="uc02-card uc02-master-list">
        <div className="uc02-card__title">
          <h3>Mahindra Masters</h3>
          <p>Upload only the Segments selected for this Project.</p>
        </div>
        {targets.map((target) => (
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
            </span>
          </button>
        ))}
      </aside>

      <div className="uc02-card uc02-card--wide">
        <div className="uc02-card__title">
          <h3>{activeTarget.label}</h3>
          <p>
            {activeTarget.kind === 'SEGMENT'
              ? 'One effective-dated workbook creates the Segment Product Master and its dynamic Price Master. Price component keys are supplied by the workbook, not hard-coded in the UI.'
              : 'One effective-dated workbook supplies Booking Protection, Minimum Booking Amount, discount/commercial controls and Trade-in policy parameters consumed by rules.'}
          </p>
        </div>

        <div className="uc02-master-actions">
          <button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>
            Get Excel Template
          </button>
        </div>

        <form className="uc02-master-upload" onSubmit={submitUpload}>
          <label className="uc02-field">
            <span>Completed Workbook</span>
            <input
              type="file"
              accept=".xlsx"
              required
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="uc02-field">
            <span>Effective From</span>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </label>
          <button className="uc02-button uc02-button--primary" disabled={busy || !file || !effectiveFrom}>
            Upload &amp; Validate
          </button>
        </form>

        {notice && <div className="uc02-note">{notice}</div>}

        {masterImport && (
          <div className="uc02-import-summary">
            <div><span>Status</span><StatusPill value={masterImport.lifecycleStatus || masterImport.status} /></div>
            <div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div>
            <div><span>Valid</span><strong>{masterImport.validRows}</strong></div>
            <div><span>Errors</span><strong>{masterImport.errorRows}</strong></div>
          </div>
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
                    <td>{row.messages.join(' · ') || 'No issues'}</td>
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
