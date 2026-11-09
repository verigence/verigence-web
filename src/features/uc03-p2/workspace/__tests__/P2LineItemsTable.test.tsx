import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import P2LineItemsTable, { lineColumns, sameLine } from '../P2LineItemsTable';

// The Shiva Construction NDC's payments as DI read them.
const READ = [
  { particulars_raw: 'BOOKING AMOUNT', voucher_type: 'UPI', credit_amount: 21000 },
  { particulars_raw: 'FINANCER AMOUNT', voucher_type: 'RTGS', credit_amount: 1920000 },
  { particulars_raw: 'DEPOSITED INTO BANK', voucher_type: 'NEFT', credit_amount: 225541 },
  { particulars_raw: 'DEPOSITED INTO BANK', voucher_type: 'Card', credit_amount: 14872 },
];

describe('line items, line by line', () => {
  it('orders columns as a line reads: what it is, references, then figures', () => {
    expect(lineColumns([{ credit_amount: 1, voucher_type: 'UPI', entry_date: 'x', particulars_raw: 'A' }], []))
      .toEqual(['particulars_raw', 'entry_date', 'voucher_type', 'credit_amount']);
    expect(lineColumns([], ['particulars_raw', 'debit_amount'])).toEqual(['particulars_raw', 'debit_amount']);
  });

  it('treats a figure typed with commas as the same line', () => {
    expect(sameLine({ a: 'X', amount: 21000 }, { a: 'X', amount: '21,000', b: null })).toBe(true);
    expect(sameLine({ a: 'X', amount: 21000 }, { a: 'X', amount: 21001 })).toBe(false);
  });

  it('shows every line with its own actions and marks the changed one', () => {
    const rows = [...READ.slice(0, 3), { ...READ[3], credit_amount: 14782 }];
    const html = renderToString(
      <P2LineItemsTable label="Line items" rows={rows} extractedRows={READ} fallbackColumns={[]}
        submit={async () => undefined} />,
    );
    expect(html).toContain('4 lines');
    expect(html).toContain('Add line');
    expect(html).toContain('Edit line 4');
    expect(html).toContain('Remove line 1');
    expect(html).toContain('19,20,000');
    expect(html.match(/Changed/g)?.length).toBe(1);
  });

  it('offers no actions while a correction waits for the Team Lead', () => {
    const html = renderToString(
      <P2LineItemsTable label="Line items" rows={READ} extractedRows={READ} fallbackColumns={[]} readOnly
        submit={async () => undefined} />,
    );
    expect(html).not.toContain('Add line');
    expect(html).not.toContain('Edit line');
  });
});
