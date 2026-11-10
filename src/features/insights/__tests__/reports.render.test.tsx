import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import CatchmentReport from '../reports/CatchmentReport';
import DiscountReport from '../reports/DiscountReport';
import FinanceReport from '../reports/FinanceReport';
import InsuranceReport from '../reports/InsuranceReport';
import PaymentsReport from '../reports/PaymentsReport';
import PenetrationReport from '../reports/PenetrationReport';
import SalesReport from '../reports/SalesReport';
import ScrappageReport from '../reports/ScrappageReport';
import { catchment, discounts, finance, insurance, payments, penetration, sales, scrappage } from './fixtures';

const render = (element: ReactElement) => renderToString(<MemoryRouter>{element}</MemoryRouter>);
/** The words a reader sees, without the markup between them. */
const words = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('the Analytics reports render what the server sent', () => {
  it('business overview', () => {
    const text = words(render(<SalesReport data={sales} />));
    expect(text).toContain('1,253');
    expect(text).toContain('₹89.1 crore');
    expect(text).toContain('Within 7 days');
  });

  it('discount control shows the stored verdicts and the outliers', () => {
    const text = words(render(<DiscountReport data={discounts} />));
    expect(text).toContain('₹1.54 crore');
    expect(text).toContain('Over entitlement');
    expect(text).toContain('Kit given as cash');
    expect(text).toContain('Entitlement unknown');
    expect(text).toContain('the corporate category is still to be confirmed');
    expect(text).toContain('MO-000123');
  });

  it('product penetration has a row per outlet and a column per product', () => {
    const text = words(render(<PenetrationReport data={penetration} />));
    for (const label of ['Finance', 'In-house insurance', 'FASTag', 'RSA', 'Extended warranty', 'Scrappage certificate']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('BARBIL');
    expect(text).toContain('623');
  });

  it('insurance names the agents the outside policies went through', () => {
    const text = words(render(<InsuranceReport data={insurance} />));
    expect(text).toContain('Codes PS0000041087, PS000041087');
    expect(text).toContain('Tata AIG');
    expect(text).toContain('Zero depreciation');
  });

  it('finance shows the lenders and the loan against ex-showroom', () => {
    const text = words(render(<FinanceReport data={finance} />));
    expect(text).toContain('Mahindra Finance');
    expect(text).toContain('Above ex-showroom');
    expect(text).toContain('₹47.4 crore');
  });

  it('scrappage shows where the old vehicles came from and the road tax saved', () => {
    const text = words(render(<ScrappageReport data={scrappage} />));
    expect(text).toContain('Delhi');
    expect(text).toContain('₹47.7 lakh');
    expect(text).toContain('COD/2026/0001');
  });

  it('payments shows the cash against the limit', () => {
    const text = words(render(<PaymentsReport data={payments} />));
    expect(text).toContain('₹74.64 crore');
    expect(text).toContain('Cash receipts above ₹2 lakh');
    expect(text).toContain('Cash receipts of exactly ₹2 lakh');
    expect(text).toContain('Just under ₹2 lakh');
    expect(text).toContain('Exactly the limit');
    expect(text).toContain('MO-777');
    expect(text).not.toContain('Refunds');   // none on file: no empty tile
  });

  it('customer catchment lists districts and PIN codes', () => {
    const text = words(render(<CatchmentReport data={catchment} />));
    expect(text).toContain('Khordha');
    expect(text).toContain('752001');
    expect(text).toContain('Cuttack');
  });
});

describe('nothing a reader should not see', () => {
  it('no report prints an internal key, a code or an empty figure', () => {
    const all = [
      render(<SalesReport data={sales} />), render(<DiscountReport data={discounts} />), render(<PenetrationReport data={penetration} />),
      render(<InsuranceReport data={insurance} />), render(<FinanceReport data={finance} />), render(<ScrappageReport data={scrappage} />),
      render(<PaymentsReport data={payments} />), render(<CatchmentReport data={catchment} />),
    ].map(words).join(' ');
    for (const leaked of ['undefined', 'NaN', '[object', 'OVER_ENTITLEMENT', 'KIT_AS_CASH', 'ENTITLEMENT_UNKNOWN', 'INHOUSE_',
      'OUTSIDE_UNCONFIRMED', 'CASH_DISCOUNT', 'CORPORATE_PRIVILEGE', 'EXCESS_DISCOUNT', 'CONFIRMED_BREACH', 'tenant']) {
      expect(all, leaked).not.toContain(leaked);
    }
  });
});
