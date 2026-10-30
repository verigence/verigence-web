import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { getSystemHealthErrors, type ErrorCodeRow } from '../../../services/audit-core/systemHealth';
import { errorRate } from './systemHealthLogic';
import { routesFor } from './trendLogic';

/**
 * Failed API requests broken down by HTTP status and Verigence error code, and
 * per route the codes it failed with (product owner 2026-10-30). Click a code to
 * narrow the routes to it.
 */
export default function FailedRequestsTab({ hours, accessToken }: { hours: number; accessToken: string }) {
  const [codeKey, setCodeKey] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const errors = useQuery({
    queryKey: ['admin', 'system-health', 'errors', hours],
    queryFn: () => getSystemHealthErrors(hours, accessToken),
    refetchInterval: 60_000,
    retry: false,
  });
  const data = errors.data;
  const routes = useMemo(() => (data ? routesFor(data.byRoute, codeKey, query) : []), [data, codeKey, query]);
  const top = data?.byCode.reduce((n, c) => Math.max(n, c.count), 0) ?? 0;

  if (errors.isError) {
    return <div className="p2w-alert p2w-alert--error" role="alert">{errors.error instanceof Error ? errors.error.message : 'The failed requests could not be loaded.'}</div>;
  }
  if (!data) return <div className="p2w-skeleton">Loading…</div>;
  const failed = data.totals.clientErrors + data.totals.serverErrors;
  const selected = data.byCode.find((c) => c.key === codeKey) ?? null;

  return (
    <div className="sh-stack">
      <dl className="tm-tiles">
        <div className={failed ? 'is-warn' : ''}><dt>Failed requests</dt><dd>{failed.toLocaleString('en-IN')}</dd>
          <span>{errorRate(failed, data.totals.requests)} of {data.totals.requests.toLocaleString('en-IN')}</span></div>
        <div className={data.totals.serverErrors ? 'is-bad' : ''}><dt>Server errors (5xx)</dt><dd>{data.totals.serverErrors}</dd>
          <span>the platform failed</span></div>
        <div><dt>Refused (4xx)</dt><dd>{data.totals.clientErrors.toLocaleString('en-IN')}</dd>
          <span>sign-in, permission, scope or invalid input</span></div>
        <div><dt>Not classified</dt><dd>{data.totals.notClassified.toLocaleString('en-IN')}</dd>
          <span>answered before codes were recorded</span></div>
      </dl>

      <SectionCard>
        <div className="p2w-card__title">
          <h3>By error code</h3>
          <p className="p2w-muted">Server errors first, then by count. Click a code to see only the routes that failed with it; ▸ lists its top routes.</p>
        </div>
        {data.byCode.length ? (
          <div className="p2dr-scroll">
            <table className="p2dr-table sh-codes">
              <thead>
                <tr><th>Status</th><th>Error code</th><th>What it means</th><th>Kind</th><th className="sh-num">Count</th><th className="sh-num">Share</th><th /></tr>
              </thead>
              <tbody>
                {data.byCode.map((c: ErrorCodeRow) => (
                  <Fragment key={c.key}>
                    <tr className={`sh-code-row${codeKey === c.key ? ' is-selected' : ''}`} onClick={() => setCodeKey(codeKey === c.key ? null : c.key)}>
                      <td><span className={`sh-status sh-status--${c.status >= 500 ? 'bad' : c.status === 401 || c.status === 403 ? 'warn' : 'muted'}`}>{c.status}</span></td>
                      <td className="sh-code">{c.errorCode ?? '—'}</td>
                      <td>{c.meaning}</td>
                      <td className="sh-note">{c.category.toLowerCase()}</td>
                      <td className="sh-num">
                        <span className="sh-inline-bar" aria-hidden="true"><span style={{ width: `${top ? Math.max((100 * c.count) / top, 2) : 0}%` }} /></span>
                        {c.count.toLocaleString('en-IN')}
                      </td>
                      <td className="sh-num">{c.share === null ? '—' : `${c.share}%`}</td>
                      <td>
                        <button type="button" className="p2w-link" aria-expanded={openCode === c.key}
                          onClick={(e) => { e.stopPropagation(); setOpenCode(openCode === c.key ? null : c.key); }}>
                          {openCode === c.key ? '▾' : '▸'} routes
                        </button>
                      </td>
                    </tr>
                    {openCode === c.key ? (
                      <tr className="sh-subrow">
                        <td />
                        <td colSpan={6}>
                          <ul className="sh-route-list">
                            {c.routes.map((r) => <li key={`${r.service}${r.route}`}><span className="sh-code">{r.route}</span><span className="sh-num">{r.count}</span></li>)}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p2w-muted">{failed ? 'These failures were answered before error codes were recorded; new ones are broken down here.' : 'No failed request in this window.'}</p>}
      </SectionCard>

      <SectionCard>
        <div className="p2w-card__title">
          <h3>By route{selected ? ` · ${selected.status} ${selected.errorCode ?? ''}` : ''}</h3>
          <p className="p2w-muted">Each route with the codes it failed with. {selected ? <button type="button" className="p2w-link" onClick={() => setCodeKey(null)}>Show every code</button> : null}</p>
        </div>
        <div className="p2w-listbar">
          <label className="sh-search">Find a route <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. documents, finance" /></label>
          <span className="p2w-muted">{routes.length} route{routes.length === 1 ? '' : 's'}</span>
        </div>
        {routes.length ? (
          <div className="p2dr-scroll">
            <table className="p2dr-table">
              <thead><tr><th>Route</th><th className="sh-num">4xx</th><th className="sh-num">5xx</th><th>Codes</th><th className="sh-num">Not classified</th></tr></thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={`${r.service}${r.route}`}>
                    <td className="sh-code">{r.route}{r.service !== 'verigence-audit-core' ? <div className="sh-note">{r.service}</div> : null}</td>
                    <td className="sh-num">{r.clientErrors}</td>
                    <td className={r.serverErrors ? 'sh-num tm-bad' : 'sh-num'}>{r.serverErrors}</td>
                    <td>
                      <span className="sh-chips">
                        {r.codes.map((c) => (
                          <button key={c.key} type="button" className={`sh-chip${codeKey === c.key ? ' is-selected' : ''}`}
                            onClick={() => setCodeKey(codeKey === c.key ? null : c.key)} title="Show only this code">
                            {c.key} <b>×{c.count}</b>
                          </button>
                        ))}
                      </span>
                    </td>
                    <td className="sh-num">{r.notClassified || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p2w-muted">No route matches.</p>}
        <ul className="sh-notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </SectionCard>
    </div>
  );
}
