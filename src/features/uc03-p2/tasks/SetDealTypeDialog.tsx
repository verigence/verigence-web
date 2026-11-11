import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getP2Journeys, setP2DealTypeForMany, type P2JourneyListItem } from '../../../services/audit-core/uc03P2';

const DEAL_TYPES = [
  { value: 'BULK', label: 'Bulk' }, { value: 'LEASE', label: 'Lease' }, { value: 'MR', label: 'MR' },
  { value: 'INSCOPE', label: 'Inscope' }, { value: 'OUTSCOPE', label: 'Outscope' },
  { value: 'RULE', label: 'Back to the rule (by booking date and VIN)' },
];
const DEAL_TYPE_TEXT: Record<string, string> = { INSCOPE: 'Inscope', OUTSCOPE: 'Outscope', MR: 'MR', LEASE: 'Lease', BULK: 'Bulk' };

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Could not save.';
}

/** A Team Lead or Reviewer sets one Deal Type on several journeys in one go
 * (product owner 2026-11-11: a bulk order is many journeys): search by
 * customer name or mobile number, tick the journeys, choose the type. Journeys
 * ticked stay ticked while the search changes. */
export default function SetDealTypeDialog({ tenantId, accessToken, onClose, onDone }: {
  tenantId: string; accessToken?: string; onClose: () => void; onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, P2JourneyListItem>>({});
  const [dealType, setDealType] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const term = search.trim();
  const journeys = useQuery({
    queryKey: ['p2-journeys', tenantId, 'deal-type-search', term],
    queryFn: () => getP2Journeys(tenantId, accessToken, term, 'all', 50),
    enabled: term.length >= 2,
    staleTime: 15_000,
  });
  const found = useMemo(() => journeys.data?.items ?? [], [journeys.data]);
  const pickedList = Object.values(picked);
  const toggle = (item: P2JourneyListItem) => setPicked((current) => {
    const next = { ...current };
    if (next[item.journey_id]) delete next[item.journey_id]; else next[item.journey_id] = item;
    return next;
  });
  const allFoundPicked = found.length > 0 && found.every((item) => picked[item.journey_id]);
  const toggleAll = () => setPicked((current) => {
    const next = { ...current };
    for (const item of found) { if (allFoundPicked) delete next[item.journey_id]; else next[item.journey_id] = item; }
    return next;
  });
  const save = useMutation({
    mutationFn: () => setP2DealTypeForMany(tenantId, {
      journeyIds: pickedList.map((item) => item.journey_id), dealType, reason: reason.trim(),
    }, accessToken),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-journeys', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-360', tenantId] });
      const label = DEAL_TYPES.find((item) => item.value === dealType)?.label ?? dealType;
      onDone(`Deal type ${dealType === 'RULE' ? 'handed back to the rule' : `set to ${label}`} on ${result.updated.length} journey${result.updated.length === 1 ? '' : 's'}`
        + (result.refused.length ? `; ${result.refused.length} outside your outlets were not changed.` : '.'));
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const line = (item: P2JourneyListItem) => [
    item.customer_name, item.mobile_last4 ? `…${item.mobile_last4}` : null, item.vehicle, item.outlet_name,
    item.journey_reference, item.deal_type ? `now ${DEAL_TYPE_TEXT[item.deal_type] ?? item.deal_type}` : 'deal type not filled',
  ].filter(Boolean).join(' · ');

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="p2w-dialog p2w-raise" role="dialog" aria-modal="true" aria-labelledby="p2w-dealtype-title"
        onSubmit={(event) => { event.preventDefault(); setError(undefined); save.mutate(); }}>
        <h3 id="p2w-dealtype-title">Set deal type</h3>
        <p>Search the journeys by customer name or mobile number, tick every journey of the deal and choose its type. Your choice wins over the rule.</p>

        <label className="p2w-raise__field">
          <span>Find journeys</span>
          <input value={search} placeholder="Customer name or mobile number" autoComplete="off" autoFocus
            onChange={(event) => setSearch(event.target.value)} />
        </label>
        {term.length >= 2 ? (
          <div className="p2w-raise__field" role="group" aria-label="Journeys found">
            {journeys.isLoading ? <span className="p2w-muted">Searching…</span>
              : found.length === 0 ? <span className="p2w-muted">No journey matches “{term}”.</span> : (
                <>
                  <label className="p2w-check">
                    <input type="checkbox" checked={allFoundPicked} onChange={toggleAll} />
                    Select all {found.length} found{journeys.data?.nextOffset ? ' (first 50; narrow the search for more)' : ''}
                  </label>
                  {found.map((item) => (
                    <label key={item.journey_id} className="p2w-check">
                      <input type="checkbox" checked={Boolean(picked[item.journey_id])} onChange={() => toggle(item)} />
                      {line(item)}
                    </label>
                  ))}
                </>
              )}
          </div>
        ) : <span className="p2w-muted p2w-raise__hint">Type at least two letters, or three digits of the mobile number.</span>}

        {pickedList.length ? (
          <div className="p2w-raise__field" role="group" aria-label="Journeys selected">
            <span>{pickedList.length} journey{pickedList.length === 1 ? '' : 's'} selected</span>
            {pickedList.filter((item) => !found.some((f) => f.journey_id === item.journey_id)).map((item) => (
              <label key={item.journey_id} className="p2w-check">
                <input type="checkbox" checked onChange={() => toggle(item)} />
                {line(item)}
              </label>
            ))}
          </div>
        ) : null}

        <label className="p2w-raise__field">
          <span>Deal type</span>
          <select value={dealType} onChange={(event) => setDealType(event.target.value)}>
            <option value="">Choose…</option>
            {DEAL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="p2w-raise__field">
          <span>Reason</span>
          <input value={reason} maxLength={200} placeholder="Why this deal type (required)" onChange={(event) => setReason(event.target.value)} />
        </label>

        {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="p2w-button p2w-button--primary"
            disabled={save.isPending || !pickedList.length || !dealType || reason.trim().length < 5}>
            {save.isPending ? 'Saving…' : `Set on ${pickedList.length || 'the selected'} journey${pickedList.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
