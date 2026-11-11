import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { setP2DealType, type P2JourneyClassification } from '../../../services/audit-core/uc03P2';
import { useProjectContextStore } from '../../../store/projectContextStore';

const DEAL_TYPE_TONE: Record<string, string> = {
  INSCOPE: 'success', OUTSCOPE: 'neutral', MR: 'info', LEASE: 'info', BULK: 'info',
};

/** A journey's Deal Type chip: its label, or "Deal type pending VIN" while it
 * is not filled (product owner 2026-11-11: not filled until the VIN is
 * provided or the Team Lead sets it). */
export function DealTypeChip({ dealType, label }: { dealType?: string | null; label?: string | null }) {
  if (!dealType) return <span className="p2w-chip p2w-chip--warning" title="Filled when the VIN is read, or when the Team Lead sets it">Deal type pending VIN</span>;
  return <span className={`p2w-chip p2w-chip--${DEAL_TYPE_TONE[dealType] ?? 'neutral'}`}>{label ?? dealType}</span>;
}

/** Deal Type, Customer Type and the insurance decision of a journey, each
 * with what it was decided on; a Team Lead or Reviewer sets the Deal Type here (MR,
 * Lease, Bulk, or Inscope / Outscope) and their call wins over the rule. */
export default function JourneyClassification({ data, tenantId, journeyId, accessToken }: {
  data: P2JourneyClassification; tenantId: string; journeyId: string; accessToken?: string;
}) {
  const role = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const supervisor = role === 'TL' || role === 'PM' || role === 'REVIEWER';
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: (command: { dealType: string; reason: string }) => setP2DealType(tenantId, journeyId, command, accessToken),
    onSuccess: () => {
      setChoice(''); setReason('');
      void queryClient.invalidateQueries({ queryKey: ['p2-360', tenantId, journeyId] });
    },
  });
  const insurance = data.insuranceTypeLabel
    ? `${data.insuranceTypeLabel}${data.insuranceConfirmed ? '' : ' (not confirmed)'}` : 'Not decided yet';
  return (
    <section className="j360-card" aria-label="Deal type, customer type and insurance">
      <dl className="j360-facts">
        <div>
          <dt>Deal type</dt>
          <dd>
            <DealTypeChip dealType={data.dealType} label={data.dealTypeLabel} />
            {data.dealTypeDecidedBy === 'TL' ? <span className="p2w-muted"> Set by the Team Lead</span> : null}
            {data.dealTypeBasis ? <small className="p2w-muted" style={{ display: 'block' }}>{data.dealTypeBasis}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Customer type</dt>
          <dd>
            {data.customerTypeLabel}
            {data.customerTypeBasis ? <small className="p2w-muted" style={{ display: 'block' }}>{data.customerTypeBasis}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Insurance</dt>
          <dd>
            {insurance}
            {data.insuranceBasis ? <small className="p2w-muted" style={{ display: 'block' }}>{data.insuranceBasis}</small> : null}
          </dd>
        </div>
      </dl>
      {supervisor ? (
        <div className="j360-mr">
          <div className="j360-mr__form">
            <label>Set deal type
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Choose…</option>
                {data.tlDealTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                {data.tlDealType ? <option value="RULE">Back to the rule (by booking date and VIN)</option> : null}
              </select>
            </label>
            <label>Reason<input type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this deal type (required)" /></label>
            <button type="button" className="p2w-button p2w-button--secondary"
              disabled={save.isPending || !choice || reason.trim().length < 5}
              onClick={() => save.mutate({ dealType: choice, reason: reason.trim() })}>
              {save.isPending ? 'Saving…' : 'Save deal type'}
            </button>
          </div>
          {save.error ? <small className="j360-insurance-source__error">{save.error instanceof Error ? save.error.message : 'Could not save.'}</small> : null}
        </div>
      ) : null}
    </section>
  );
}
