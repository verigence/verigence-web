import { describe, expect, it } from 'vitest';

import type {
  SkuApplyCheck,
  SkuCheckNumbers,
  SkuProposal,
  SkuResolutionRunItem,
  SkuResolutionRunSummary,
} from '../services/audit-core/skuResolution';
import {
  actionWords,
  applyEnabled,
  basisChange,
  basisWords,
  bucketCounts,
  checkIsFresh,
  checkSummaryLine,
  confirmLines,
  csvCell,
  csvFileName,
  documentWords,
  filterItems,
  itemBucket,
  latestCheckRun,
  priceColumns,
  rupees,
  skuChange,
  taskWords,
  toCsv,
  vehicleAsBooked,
} from './skuReview';

const proposal = (over: Partial<SkuProposal>): SkuProposal => ({
  action: 'BOOKING_PIN',
  group: 'KEEP',
  oldSku: 'THAR-LX',
  oldBasis: 'AUTO_MATCHED',
  proposedSku: 'THAR-LX',
  proposedBasis: 'AUTO_MATCHED',
  changes: false,
  tasks: [],
  ...over,
});

let counter = 0;
const item = (over: Omit<Partial<SkuResolutionRunItem>, 'proposal'> & { proposal?: Partial<SkuProposal> | null }): SkuResolutionRunItem => {
  counter += 1;
  const { proposal: p, ...rest } = over;
  return {
    journeyId: `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`,
    journeyLabel: `Customer ${counter}`,
    modelLabel: 'THAR · LX',
    outcome: 'ALREADY_HAD_SKU',
    skuCode: 'THAR-LX',
    detail: null,
    proposal: p === null ? null : proposal(p ?? {}),
    ...rest,
  };
};

const change = item({ proposal: { group: 'CHANGE', oldSku: 'THAR-LX', proposedSku: 'THAR-AX', changes: true, oldBasis: 'AUTO_LEGACY' } });
const confirm = item({
  proposal: { group: 'CONFIRM', action: 'UNCONFIRMED', proposedBasis: 'AUTO_UNCONFIRMED', tasks: ['SKU_NOT_CONFIRMED'] },
});
const keep = item({ proposal: { group: 'KEEP' } });
const pc = item({ proposal: { group: 'LEFT_ALONE', action: 'KEEP_HUMAN', oldBasis: 'PC_CONFIRMED', proposedBasis: 'PC_CONFIRMED' } });
const done = item({ proposal: { group: 'LEFT_ALONE', action: 'LEFT_ALONE', skipped: 'review_completed' } });
const failed = item({ outcome: 'FAILED', detail: 'boom', proposal: null });
const all = [keep, pc, failed, confirm, done, change];

describe('groups', () => {
  it('takes FAILED from the outcome and everything else from the server group', () => {
    expect(itemBucket(failed)).toBe('FAILED');
    expect(itemBucket(change)).toBe('CHANGE');
    expect(itemBucket(item({ proposal: null }))).toBeNull();
  });

  it('counts each group once', () => {
    expect(bucketCounts(all)).toEqual({ CHANGE: 1, CONFIRM: 1, KEEP: 1, LEFT_ALONE: 2, FAILED: 1 });
  });

  it('filters by group, searches by words, and lists what needs a look first', () => {
    expect(filterItems(all, 'ALL').map(itemBucket)).toEqual(['CHANGE', 'CONFIRM', 'FAILED', 'KEEP', 'LEFT_ALONE', 'LEFT_ALONE']);
    expect(filterItems(all, 'LEFT_ALONE')).toHaveLength(2);
    expect(filterItems(all, 'ALL', 'thar-ax')).toEqual([change]);
    expect(filterItems(all, 'CHANGE', 'nothing like this')).toEqual([]);
  });
});

describe('plain words', () => {
  it('words every basis without jargon', () => {
    for (const basis of ['AUTO_MATCHED', 'AUTO_PRICE_MISMATCH', 'AUTO_INVOICE_MATCHED', 'AUTO_LEGACY', 'AUTO_UNCONFIRMED', 'PC_CONFIRMED', 'TL_APPROVED', 'SOMETHING_NEW']) {
      const words = basisWords(basis);
      expect(words).not.toMatch(/[A-Z]+_[A-Z]+/);
      expect(words.length).toBeGreaterThan(5);
    }
    expect(basisWords(null)).toBe('');
    expect(basisWords('AUTO_LEGACY')).toBe('Matched automatically earlier; not re-checked yet');
  });

  it('words every task, and the booking price one as the product owner asked', () => {
    expect(taskWords('SKU_PRICE_MISMATCH (booking)')).toBe('Confirm the model and price (booking form)');
    expect(taskWords('SOME_NEW_TASK')).toBe('some new task');
  });

  it('words what a Check will do and what an Apply did', () => {
    expect(actionWords(change, false)).toBe('Replace the SKU');
    expect(actionWords(item({ proposal: { group: 'CHANGE', oldSku: null, proposedSku: 'THAR-AX' } }), false)).toBe('Set the SKU');
    expect(actionWords(confirm, false)).toBe('Keep the SKU; the PC is asked to confirm it');
    expect(actionWords(item({ proposal: { group: 'CONFIRM', oldSku: null, proposedSku: null } }), false)).toBe('No SKU; the PC is asked to set it');
    expect(actionWords(keep, false)).toBe('Keep the SKU');
    expect(actionWords(item({ proposal: { group: 'KEEP', oldBasis: 'AUTO_LEGACY' } }), false)).toBe('Keep the SKU (how it was matched is updated)');
    expect(actionWords(pc, false)).toBe('Left alone: set by the PC');
    expect(actionWords(done, false)).toBe('Left alone: review is complete');
    expect(actionWords(item({ proposal: { group: 'LEFT_ALONE', skipped: 'booking_cancelled' } }), false)).toBe('Left alone: booking cancelled, duplicate or closed');
    expect(actionWords(item({ proposal: { group: 'LEFT_ALONE', oldBasis: 'TL_APPROVED' } }), false)).toBe('Left alone: approved by the Team Lead');
    expect(actionWords(failed, false)).toBe('Failed, nothing changed: boom');
  });

  it('says what an Apply actually did, and when that differs from the check', () => {
    const replaced = item({ proposal: { group: 'CHANGE', actionTaken: 'REPLACED' } });
    expect(actionWords(replaced, true)).toBe('Replaced the SKU');
    const moved = item({ proposal: { group: 'CHANGE', actionTaken: 'KEPT', differsFromCheck: true } });
    expect(actionWords(moved, true)).toBe('Kept the SKU (different from the check)');
    expect(actionWords(item({ proposal: { group: 'CONFIRM', actionTaken: 'KEPT_AND_FLAGGED' } }), true))
      .toBe('Kept the SKU; the PC is asked to confirm it');
  });

  it('shows the SKU change and the basis change', () => {
    expect(skuChange(change)).toBe('THAR-LX → THAR-AX');
    expect(skuChange(keep)).toBe('THAR-LX');
    expect(skuChange(item({ proposal: { oldSku: null, proposedSku: null } }))).toBe('no SKU');
    expect(basisChange(change)).toBe('Matched automatically earlier; not re-checked yet → Matched by its words; booking price agrees');
    expect(basisChange(keep)).toBe('Matched by its words; booking price agrees');
  });

  it('gives the vehicle as booked, then the words on each document', () => {
    const withDocs = item({
      proposal: {
        booking: { documentType: 'booking_form', documentId: 'b', words: 'THAR / AX', exShowroom: '1300000', sku: 'THAR-AX', masterExShowroom: '1300000.00' },
        invoice: { documentType: 'tax_invoice_dms', documentId: 'i', words: 'THAR AX 4X4', exShowroom: '1310000', sku: null, masterExShowroom: null },
      },
    });
    expect(vehicleAsBooked(withDocs)).toBe('THAR / AX');
    expect(documentWords(withDocs)).toBe('Booking form: THAR / AX; Invoice: THAR AX 4X4');
    expect(vehicleAsBooked(item({ proposal: null, modelLabel: 'Scorpio N' }))).toBe('Scorpio N');
  });
});

describe('prices', () => {
  it('writes rupees with Indian grouping and nothing for a missing price', () => {
    expect(rupees('1300000')).toBe('₹13,00,000');
    expect(rupees(839501.15)).toBe('₹8,39,501.15');
    expect(rupees(null)).toBe('');
    expect(rupees('n/a')).toBe('');
  });

  it('lines up the booking form price, the master price and the invoice', () => {
    const priced = item({
      proposal: {
        priceCheck: 'DIFFERS',
        masterExShowroom: '1300000.00',
        booking: { documentType: 'booking_form', documentId: null, words: 'THAR / AX', exShowroom: '1250000', sku: 'THAR-AX', masterExShowroom: '1300000.00' },
        invoice: { documentType: 'tax_invoice_dms', documentId: null, words: null, exShowroom: '1300000', sku: 'THAR-AX', masterExShowroom: '1300000.00' },
      },
    });
    expect(priceColumns(priced)).toEqual({ booking: '₹12,50,000', master: '₹13,00,000', invoice: '₹13,00,000', check: 'Prices differ' });
    expect(priceColumns(item({ proposal: null }))).toEqual({ booking: '', master: '', invoice: '', check: '' });
  });
});

describe('Apply', () => {
  const numbers: SkuCheckNumbers = {
    runId: 'a1b2c3d4-0000-0000-0000-000000000000',
    startedAtUtc: '2026-10-21T10:00:00Z',
    finishedAtUtc: '2026-10-21T10:05:00Z',
    journeysTotal: 120,
    journeysChecked: 118,
    failed: 2,
    notChecked: 1,
    willChange: 14,
    needConfirmation: 9,
    keep: 60,
    leftAlone: 33,
  };

  it('is enabled only when the server says a usable check exists and nothing is running', () => {
    const allowed: SkuApplyCheck = { allowed: true, code: 'OK', message: '', check: numbers };
    expect(applyEnabled(allowed, false)).toBe(true);
    expect(applyEnabled(allowed, true)).toBe(false);
    expect(applyEnabled({ ...allowed, allowed: false, code: 'NO_CHECK_RUN' }, false)).toBe(false);
    expect(applyEnabled({ ...allowed, check: null }, false)).toBe(false);
    expect(applyEnabled(undefined, false)).toBe(false);
  });

  it('judges a check fresh for 24 hours', () => {
    const started = '2026-10-21T10:00:00Z';
    expect(checkIsFresh(started, new Date('2026-10-22T09:59:00Z'))).toBe(true);
    expect(checkIsFresh(started, new Date('2026-10-22T10:01:00Z'))).toBe(false);
    expect(checkIsFresh('not a date', new Date())).toBe(false);
  });

  it('states the check next to the button, with its time and counts', () => {
    const line = checkSummaryLine(numbers, 'en-IN');
    expect(line).toContain('118 of 120 journeys checked');
    expect(line).toContain('14 will change SKU');
    expect(line).toContain('9 need PC confirmation');
    expect(line).toContain('2 failed (they are not changed)');
    expect(line).toContain('1 journey was added after the check');
  });

  it('says in the dialog how many change, how many get a confirm task and how many are left alone', () => {
    const lines = confirmLines(numbers);
    expect(lines[0]).toBe('14 journeys will change SKU.');
    expect(lines[1]).toBe('9 journeys keep their SKU (or have none) and get a PC task to confirm it.');
    expect(lines[2]).toContain('93 journeys are left alone (60 already right, 33 set by a PC or Team Lead');
    expect(lines.join(' ')).toContain('2 journeys failed in the check and will not be changed.');
    const one = confirmLines({ ...numbers, willChange: 1, needConfirmation: 1, failed: 0, notChecked: 0 });
    expect(one[0]).toBe('1 journey will change SKU.');
    expect(one[1]).toBe('1 journey keeps its SKU (or has none) and gets a PC task to confirm it.');
  });

  it('finds the latest complete check in the history', () => {
    const run = (runId: string, runMode: SkuResolutionRunSummary['runMode'], status: 'RUNNING' | 'COMPLETE') =>
      ({ runId, runMode, status }) as SkuResolutionRunSummary;
    const runs = [run('a', 'RERESOLVE_COMMIT', 'COMPLETE'), run('b', 'RERESOLVE_DRY_RUN', 'RUNNING'), run('c', 'RERESOLVE_DRY_RUN', 'COMPLETE')];
    expect(latestCheckRun(runs)?.runId).toBe('c');
    expect(latestCheckRun([])).toBeUndefined();
  });
});

describe('CSV', () => {
  it('quotes cells and keeps a sheet from running text as a formula', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell(null)).toBe('');
  });

  it('writes one header row and one row per journey shown, in plain words', () => {
    const csv = toCsv([change, failed], false);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Journey,Vehicle as booked,Current SKU,Proposed SKU,Current basis,Proposed basis,Group,Action,Booking form ex-showroom,Master ex-showroom,Invoice ex-showroom,Price check,Document\'s words,Why,PC tasks');
    expect(lines[1]).toContain('THAR-LX,THAR-AX');
    expect(lines[1]).toContain('Will change,Replace the SKU');
    expect(lines[2]).toContain('Failed,"Failed, nothing changed: boom"');
    expect(csv).not.toMatch(/AUTO_|PC_CONFIRMED/);
    expect(toCsv([change], true)).toContain('Changed');
  });

  it('names the file after the kind and day of the run', () => {
    expect(csvFileName('abcdef12-0000', 'RERESOLVE_DRY_RUN', '2026-10-21T10:00:00Z')).toBe('sku-check-2026-10-21-abcdef12.csv');
    expect(csvFileName('abcdef12-0000', 'RERESOLVE_COMMIT', '2026-10-21T10:00:00Z')).toBe('sku-apply-2026-10-21-abcdef12.csv');
  });
});
