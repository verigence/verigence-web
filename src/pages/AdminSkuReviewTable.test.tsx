import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { SkuResolutionRunDetail } from '../services/audit-core/skuResolution';
import AdminSkuReviewTable from './AdminSkuReviewTable';

const run = (runMode: SkuResolutionRunDetail['runMode']): SkuResolutionRunDetail => ({
  runId: 'abcdef12-0000-0000-0000-000000000000',
  status: 'COMPLETE',
  startedAtUtc: '2026-10-21T10:00:00Z',
  finishedAtUtc: '2026-10-21T10:05:00Z',
  journeysTotal: 3,
  journeysProcessed: 2,
  newlyMatched: 0,
  alreadyHadSku: 2,
  stillUnmatched: 0,
  failed: 1,
  withSkuBefore: 2,
  withSkuAfter: 2,
  runMode,
  items: [
    {
      journeyId: '1', journeyLabel: 'Asha Verma', modelLabel: 'THAR · LX', outcome: 'ALREADY_HAD_SKU', skuCode: 'THAR-AX', detail: null,
      proposal: {
        action: 'BOOKING_PIN', group: 'CHANGE', oldSku: 'THAR-LX', oldBasis: 'AUTO_LEGACY', proposedSku: 'THAR-AX', proposedBasis: 'AUTO_MATCHED',
        changes: true, priceCheck: 'MATCH', masterExShowroom: '1300000.00', tasks: [],
        booking: { documentType: 'booking_form', documentId: 'b', words: 'THAR / AX', exShowroom: '1300000', sku: 'THAR-AX', masterExShowroom: '1300000.00' },
        actionTaken: 'REPLACED',
      },
    },
    {
      journeyId: '2', journeyLabel: 'Ravi', modelLabel: null, outcome: 'ALREADY_HAD_SKU', skuCode: 'THAR-LX', detail: null,
      proposal: { action: 'KEEP_HUMAN', group: 'LEFT_ALONE', oldSku: 'THAR-LX', oldBasis: 'PC_CONFIRMED', proposedSku: 'THAR-LX', proposedBasis: 'PC_CONFIRMED', tasks: ['SKU_BOOKING_FORM_DIFFERS'] },
    },
    { journeyId: '3', journeyLabel: 'Sunil', modelLabel: null, outcome: 'FAILED', skuCode: null, detail: 'boom', proposal: null },
  ],
});

describe('AdminSkuReviewTable', () => {
  it('shows the counts at the top and a labelled row for every journey of a Check', () => {
    const html = renderToStaticMarkup(<AdminSkuReviewTable run={run('RERESOLVE_DRY_RUN')} />);
    for (const label of ['All journeys', 'Will change', 'Needs PC confirmation', 'Left alone', 'Failed']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('THAR-LX → THAR-AX');
    expect(html).toContain('₹13,00,000');
    expect(html).toContain('data-label="What will happen"');
    expect(html).toContain('A booking form names another vehicle than the confirmed SKU');
    expect(html).toContain('Download CSV (3)');
    expect(html).not.toMatch(/AUTO_LEGACY|PC_CONFIRMED/);
  });

  it('lists a task that repeats once per invoice under distinct React keys', async () => {
    // The server renderer does not check keys, so the keys given to the list
    // items are recorded as the elements are created.
    const keys: Array<string | null | undefined> = [];
    vi.resetModules();
    vi.doMock('react/jsx-dev-runtime', async (importOriginal) => {
      const original = await importOriginal<typeof import('react/jsx-dev-runtime')>();
      return {
        ...original,
        jsxDEV: (type: unknown, props: unknown, key: string | undefined, ...rest: unknown[]) => {
          if (type === 'li') keys.push(key);
          return (original.jsxDEV as (...a: unknown[]) => unknown)(type, props, key, ...rest);
        },
      };
    });
    try {
      const { default: Table } = await import('./AdminSkuReviewTable');
      const base = run('RERESOLVE_DRY_RUN');
      const item = base.items[0];
      const repeated = {
        ...base,
        items: [{ ...item, proposal: { ...item.proposal!, tasks: ['SKU_PRICE_MISMATCH (invoice)', 'SKU_PRICE_MISMATCH (invoice)'] } }],
      };
      const html = renderToStaticMarkup(<Table run={repeated} />);
      expect(html.match(/<li>/g)).toHaveLength(2);
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
    } finally {
      vi.doUnmock('react/jsx-dev-runtime');
      vi.resetModules();
    }
  });

  it('words an Apply in the past tense', () => {
    const html = renderToStaticMarkup(<AdminSkuReviewTable run={run('RERESOLVE_COMMIT')} />);
    expect(html).toContain('Changed');
    expect(html).toContain('Replaced the SKU');
    expect(html).toContain('What was done');
  });
});
