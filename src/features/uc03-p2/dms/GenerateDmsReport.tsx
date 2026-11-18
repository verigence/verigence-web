import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { generateDmsReport, getIntimationCounter } from '../../../services/audit-core/uc03DmsIntimations';

type Props = {
  tenantId?: string;
  accessToken?: string;
  /** The day whose dumps the report is of (YYYY-MM-DD); today when empty. */
  day: string;
  days?: string[];
  onDay?: (day: string) => void;
  onError: (message: string | null) => void;
  onGenerated?: (reportId: string) => void;
};

/**
 * Generate the DMS report (product owner 18 Nov 2026): "When this button is clicked pls ask a
 * question on pop up window, Pls make sure all PC have intimated their booking information.
 * there should be an option to continue or cancel." The dialog also shows, per dealership,
 * how many rows are still not marked by any PC, so the person generating it can check first.
 * One report covers the day's booking and delivery dumps; it lands in Reports.
 */
export default function GenerateDmsReport({ tenantId, accessToken, day, days, onDay, onError, onGenerated }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const counters = useQueries({
    queries: (['BOOKING', 'DELIVERY'] as const).map((kind) => ({
      queryKey: ['dms-intimation-counter', tenantId, kind],
      queryFn: () => getIntimationCounter(tenantId!, kind, accessToken),
      enabled: open && Boolean(tenantId && accessToken),
    })),
  });
  const generate = async () => {
    setBusy(true);
    onError(null);
    try {
      const made = await generateDmsReport(tenantId!, day || undefined, accessToken);
      setOpen(false);
      if (onGenerated) onGenerated(made.reportId);
      else navigate(`/p2/reports/dms?report=${encodeURIComponent(made.reportId)}`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The report could not be generated.');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="p2du-export">
        {days && onDay ? (
          <label>
            <span>Dumps of</span>
            <select aria-label="Day of the dumps" value={day} disabled={!days.length} onChange={(e) => onDay(e.target.value)}>
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" className="p2w-button p2w-button--primary" disabled={!tenantId || busy || (days ? !day : false)}
          onClick={() => setOpen(true)}>
          Generate report
        </button>
      </div>
      {open ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="p2w-dialog dmsg-dialog" role="dialog" aria-modal="true" aria-labelledby="dmsg-title">
            <h3 id="dmsg-title">Generate the DMS report{day ? ` of ${day}` : ''}</h3>
            <p><strong>Pls make sure all PC have intimated their booking information</strong> (and their delivery information) before you continue.</p>
            {counters.some((c) => c.isLoading) ? <p className="p2w-muted">Checking what is still not marked…</p> : null}
            {counters.map((c, i) => (c.data?.dealers.length ? (
              <div key={i} className="dmsg-open">
                <b>{i === 0 ? 'Booking dump' : 'Delivery dump'}</b>
                <ul>
                  {c.data.dealers.map((d) => (
                    <li key={d.dealerId}>
                      {d.dealerName}: {d.dumpDate
                        ? <>{d.totals.open} not marked by any PC <span className="p2w-muted">({d.totals.intimated} marked, {d.totals.inVerigence} in Verigence)</span></>
                        : <span className="p2w-muted">no dump</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null))}
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => void generate()}>
                {busy ? 'Generating…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
