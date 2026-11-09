import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import StatusPill from '../../components/StatusPill';
import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  getSevaSutraInstance,
  listSevaSutraFreeDealerships,
  putSevaSutraInstance,
  type SevaSutraInstance,
} from '../../services/audit-core/uc02Admin';

const DOMAIN = 'sevasutra.jbrconsulting.in';
const SHARED_URL = `https://${DOMAIN}`;
const SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

const STATUS_TEXT: Record<SevaSutraInstance['status'], string> = {
  REQUESTED: 'Requested — SevaSutra picks it up within a few minutes.',
  CREATED: 'Created in SevaSutra — its address goes live with the next deployment (within about 15 minutes).',
  LIVE: 'Live.',
  FAILED: 'The address could not be put live.',
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** A suggested address from a name: lower case, words joined by hyphens, at most 40 characters. */
function suggestAddress(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|group|service|audit)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/**
 * Step 1 of a service-audit Project: its SevaSutra instance. A Super Admin creates it with the
 * dealership's name and its own address; SevaSutra opens the dealership and the deployment workflow puts
 * the address live. Everyone else sees its status. Polls while it is on its way.
 */
export default function SevaSutraInstanceCard({
  tenantId,
  projectName,
  accessToken,
  canManage,
}: {
  tenantId: string;
  projectName: string;
  accessToken?: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ['sevasutra-instance', tenantId];
  const lookup = useQuery({
    queryKey: key,
    queryFn: () => getSevaSutraInstance(tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const status = query.state.data?.instance?.status;
      return status === 'REQUESTED' || status === 'CREATED' ? 30_000 : false;
    },
  });
  const instance = lookup.data?.instance ?? null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(() => instance?.dealershipName ?? projectName);
  const [address, setAddress] = useState(() => (instance ? instance.subdomain ?? '' : suggestAddress(projectName)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A new dealership, or one SevaSutra already holds that no Project owns (the demo, for one).
  const [source, setSource] = useState<'new' | 'existing'>('new');
  const [existing, setExisting] = useState('');
  const free = useQuery({
    queryKey: ['sevasutra-free-dealerships'],
    queryFn: () => listSevaSutraFreeDealerships(accessToken),
    enabled: Boolean(canManage && accessToken && !instance && !lookup.isLoading),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const freeList = free.data?.dealerships ?? [];

  useEffect(() => {
    if (editing) return;
    setName(instance?.dealershipName ?? projectName);
    setAddress(instance ? instance.subdomain ?? '' : suggestAddress(projectName));
  }, [instance, projectName, editing]);

  const addressValid = !address || SUBDOMAIN.test(address);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const attach = !instance && source === 'existing' ? existing : null;
      const result = await putSevaSutraInstance(
        tenantId,
        { dealershipName: name.trim(), subdomain: address.trim() || null, ...(attach ? { existingDealerCode: attach } : {}) },
        accessToken,
      );
      queryClient.setQueryData(key, result);
      setEditing(false);
    } catch (failure) {
      setError(auditCoreErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const liveUrl = instance?.status === 'LIVE' ? `https://${instance.liveHostname || DOMAIN}` : null;
  const showForm = canManage && (editing || (!instance && !lookup.isLoading && !lookup.isError));

  return (
    <div className="uc02-card uc02-list-card" data-sevasutra-card="true">
      <div className="uc02-list-toolbar">
        <div className="uc02-card__title">
          <h3>SevaSutra instance</h3>
          <p>
            This service-audit Project runs in SevaSutra (workshop audit).{' '}
            {instance ? 'Its dealership follows this Project within a few minutes.' : 'Create its instance to open it in SevaSutra.'}
          </p>
        </div>
        {liveUrl && (
          <a className="uc02-button uc02-button--primary" href={liveUrl} target="_blank" rel="noreferrer">
            Open SevaSutra
          </a>
        )}
      </div>

      {lookup.isError && <div className="uc02-note" role="alert">{auditCoreErrorMessage(lookup.error)}</div>}

      {instance && !editing && (
        <dl className="uc02-instance">
          <div>
            <dt>Dealership</dt>
            <dd>
              <strong>{instance.dealershipName}</strong>
              {instance.dealerCode && <small>Dealer code {instance.dealerCode}</small>}
            </dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>
              {instance.subdomain ? <code>{instance.subdomain}.{DOMAIN}</code> : <span>Shared address ({DOMAIN})</span>}
              {liveUrl && instance.liveHostname && instance.liveHostname !== `${instance.subdomain}.${DOMAIN}` && instance.subdomain && (
                <small>Live now at {instance.liveHostname}; the new address is on its way.</small>
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusPill value={instance.status} compact />
              <small>{instance.status === 'FAILED' && instance.statusMessage ? instance.statusMessage : STATUS_TEXT[instance.status]}</small>
            </dd>
          </div>
          <div>
            <dt>Last report from SevaSutra</dt>
            <dd>{when(instance.reportedAtUtc)}</dd>
          </div>
        </dl>
      )}

      {instance && !editing && canManage && (
        <div className="uc02-actions">
          <button className="uc02-button" type="button" onClick={() => setEditing(true)}>
            {instance.status === 'FAILED' ? 'Change address and try again' : 'Change name or address'}
          </button>
        </div>
      )}

      {!instance && !canManage && !lookup.isLoading && !lookup.isError && (
        <div className="uc02-empty">No SevaSutra instance yet. A Super Admin creates it here.</div>
      )}

      {showForm && (
        <form className="uc02-form-grid" onSubmit={save}>
          {!instance && (
            <fieldset className="uc02-field uc02-source">
              <span>Dealership in SevaSutra</span>
              <label>
                <input type="radio" name="sevasutra-source" checked={source === 'new'} onChange={() => { setSource('new'); setExisting(''); setName(projectName); }} />
                New dealership (starts empty)
              </label>
              <label>
                <input type="radio" name="sevasutra-source" checked={source === 'existing'} disabled={!freeList.length} onChange={() => setSource('existing')} />
                Existing SevaSutra dealership {freeList.length ? '' : '(none free)'}
              </label>
              {source === 'existing' && (
                <select
                  required
                  value={existing}
                  onChange={(event) => {
                    setExisting(event.target.value);
                    const pick = freeList.find((item) => item.dealerCode === event.target.value);
                    if (pick) setName(pick.dealershipName);
                  }}
                >
                  <option value="">Choose a dealership</option>
                  {freeList.map((item) => (
                    <option key={item.dealerCode} value={item.dealerCode}>
                      {item.dealershipName} · {item.visits} visits · {item.outlets} outlet{item.outlets === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              )}
              <small>
                {source === 'existing'
                  ? 'It keeps all its data; people mapped to this Project will see it.'
                  : 'Use Existing to tie a dealership already in SevaSutra (such as the demo) to this Project.'}
              </small>
            </fieldset>
          )}
          <label className="uc02-field">
            <span>Dealership name</span>
            <input required minLength={2} maxLength={240} value={name} onChange={(event) => setName(event.target.value)} />
            <small>As people will see it in SevaSutra.</small>
          </label>
          <label className="uc02-field">
            <span>Address</span>
            <div className="uc02-address">
              <input
                value={address}
                maxLength={40}
                aria-invalid={!addressValid}
                placeholder="e.g. shree"
                onChange={(event) => setAddress(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              />
              <span>.{DOMAIN}</span>
            </div>
            <small>
              {addressValid
                ? address
                  ? `People of this dealership sign in at https://${address}.${DOMAIN}.`
                  : `Leave empty to open it from ${SHARED_URL} only.`
                : 'Letters, digits and hyphens; not starting or ending with a hyphen.'}
            </small>
          </label>
          {error && <div className="uc02-note" role="alert">{error}</div>}
          <div className="uc02-actions">
            {editing && (
              <button className="uc02-button" type="button" onClick={() => { setEditing(false); setError(''); }}>
                Cancel
              </button>
            )}
            <button className="uc02-button uc02-button--primary" disabled={busy || !name.trim() || !addressValid || (!instance && source === 'existing' && !existing)}>
              {busy ? 'Saving…' : instance ? 'Save' : source === 'existing' ? 'Attach to this Project' : 'Create SevaSutra instance'}
            </button>
          </div>
        </form>
      )}

      <ul className="uc02-checklist">
        <li><strong>Dealers and Dealer Outlets</strong> added here (Steps 2 and 3) become the dealership's outlets in SevaSutra.</li>
        <li><strong>Role Mapping</strong> (Step 5) decides who signs in: Process Consultant or Analyst (at the Outlets ticked), Team Lead, Project Manager, Executive, or Client for people who are not JBR employees and see the analytics only. Other roles give no access to SevaSutra.</li>
        <li>People sign in with their Verigence email and password, and see only the Projects they are mapped to.</li>
      </ul>
    </div>
  );
}
