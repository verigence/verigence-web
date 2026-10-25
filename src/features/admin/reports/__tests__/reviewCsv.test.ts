import { describe, expect, it } from 'vitest';

import type { JourneyReviewRow } from '../../../../services/audit-core/adminReports';
import { reviewCsv } from '../reviewCsv';

describe('reviewCsv', () => {
  const rows: JourneyReviewRow[] = [
    {
      ref: 'J-1', customer: 'A, B "C"', price_variance: '-395890', note: '=SUM(A1)', sku_code: null,
      invoices: [{ inv_no: 'INV1', gross: '100', discount: '10', doc: 'aa' }],
    },
    { ref: 'J-2', customer: 'D', invoices: [] },
  ];

  it('writes one line per Journey with every field and the invoices', () => {
    const lines = reviewCsv(rows).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('ref,customer,price_variance,note,sku_code,invoices');
    expect(lines[1]).toContain('"A, B ""C"""');
    expect(lines[1]).toContain('inv_no=INV1; ');
    expect(lines[2]).toBe('J-2,D,,,,');
  });

  it('keeps negative numbers numeric but neutralises formulas', () => {
    const line = reviewCsv(rows).split('\r\n')[1];
    expect(line).toContain(',-395890,');
    expect(line).toContain(",'=SUM(A1),");
  });
});
