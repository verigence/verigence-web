import { useMemo, useState } from 'react';

import type { SkuResolutionRunDetail } from '../services/audit-core/skuResolution';
import {
  BUCKET_LABEL,
  BUCKET_LABEL_DONE,
  BUCKET_ORDER,
  actionWords,
  basisChange,
  bucketCounts,
  csvFileName,
  documentWords,
  filterItems,
  itemBucket,
  priceColumns,
  skuChange,
  tasksWords,
  toCsv,
  vehicleAsBooked,
  type SkuReviewBucket,
} from './skuReview';

import '../styles/sku-review.css';

function downloadCsv(run: SkuResolutionRunDetail, csv: string) {
  // The byte-order mark makes Excel read the rupee sign and arrows as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFileName(run.runId, run.runMode, run.startedAtUtc);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * One Check or Apply run, journey by journey: the counts at the top (each one filters the table),
 * a search box, the table (cards on a phone) and a CSV download of what is shown.
 */
export default function AdminSkuReviewTable({ run }: { run: SkuResolutionRunDetail }) {
  const applied = run.runMode === 'RERESOLVE_COMMIT';
  const [bucket, setBucket] = useState<SkuReviewBucket | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const counts = useMemo(() => bucketCounts(run.items), [run.items]);
  const shown = useMemo(() => filterItems(run.items, bucket, search), [run.items, bucket, search]);
  const labels = applied ? BUCKET_LABEL_DONE : BUCKET_LABEL;

  return (
    <div className="sku-review">
      <div className="sku-review__counts" role="group" aria-label="Show journeys by what happens to them">
        <button
          type="button"
          className={`sku-review__count${bucket === 'ALL' ? ' is-active' : ''}`}
          aria-pressed={bucket === 'ALL'}
          onClick={() => setBucket('ALL')}
        >
          <strong>{run.items.length}</strong>
          <span>All journeys</span>
        </button>
        {BUCKET_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className={`sku-review__count sku-review__count--${key.toLowerCase()}${bucket === key ? ' is-active' : ''}`}
            aria-pressed={bucket === key}
            disabled={counts[key] === 0}
            onClick={() => setBucket(bucket === key ? 'ALL' : key)}
          >
            <strong>{counts[key]}</strong>
            <span>{labels[key]}</span>
          </button>
        ))}
      </div>

      <div className="sku-review__tools">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a journey, vehicle or SKU"
          aria-label="Find a journey, vehicle or SKU"
        />
        <button
          type="button"
          className="button"
          disabled={shown.length === 0}
          onClick={() => downloadCsv(run, toCsv(shown, applied))}
        >
          Download CSV ({shown.length})
        </button>
      </div>

      {shown.length === 0 ? <p>No journeys in this view.</p> : (
        <div className="sku-review__table-wrap">
          <table className="sku-review__table">
            <thead>
              <tr>
                <th>Journey</th>
                <th>Vehicle as booked</th>
                <th>SKU now → {applied ? 'after' : 'proposed'}</th>
                <th>How it was matched</th>
                <th>{applied ? 'What was done' : 'What will happen'}</th>
                <th>Booking form price</th>
                <th>Master price</th>
                <th>Invoice ex-showroom</th>
                <th>Words on the documents</th>
                <th>PC tasks {applied ? 'raised' : 'that would be raised'}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => {
                const key = itemBucket(item);
                const prices = priceColumns(item);
                const tasks = tasksWords(item.proposal);
                return (
                  <tr key={item.journeyId} className={key ? `sku-review__row--${key.toLowerCase()}` : undefined}>
                    <td data-label="Journey"><strong>{item.journeyLabel || item.journeyId.slice(0, 8)}</strong></td>
                    <td data-label="Vehicle as booked">{vehicleAsBooked(item) || '—'}</td>
                    <td data-label={applied ? 'SKU now → after' : 'SKU now → proposed'}>{skuChange(item) || '—'}</td>
                    <td data-label="How it was matched">{basisChange(item) || '—'}</td>
                    <td data-label={applied ? 'What was done' : 'What will happen'}>
                      <span className={`sku-review__pill${key ? ` sku-review__pill--${key.toLowerCase()}` : ''}`}>
                        {key ? labels[key] : 'Run before Check existed'}
                      </span>
                      <br />
                      {actionWords(item, applied)}
                      {item.proposal?.why ? <small className="sku-review__why">{item.proposal.why}</small> : null}
                    </td>
                    <td data-label="Booking form price">{prices.booking || '—'}</td>
                    <td data-label="Master price">
                      {prices.master || '—'}
                      {prices.check ? <small className="sku-review__why">{prices.check}</small> : null}
                    </td>
                    <td data-label="Invoice ex-showroom">{prices.invoice || '—'}</td>
                    <td data-label="Words on the documents">{documentWords(item) || '—'}</td>
                    <td data-label={applied ? 'PC tasks raised' : 'PC tasks that would be raised'}>
                      {tasks.length ? (
                        <ul className="sku-review__tasks">{tasks.map((task) => <li key={task}>{task}</li>)}</ul>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
