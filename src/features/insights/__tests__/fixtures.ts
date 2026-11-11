import type {
  CatchmentInsight, DiscountInsight, FinanceInsight, InsightEnvelope, InsuranceInsight, PaymentsInsight, PenetrationInsight,
  ProductCell, ProductInfo, SalesInsight, ScrappageInsight,
} from '../../../services/audit-core/uc03Insights';

/** Reports as the server sends them, with figures of the size a Project carries. */

const envelope = <R extends InsightEnvelope['report']>(report: R): InsightEnvelope & { report: R } => ({
  report,
  asOfUtc: '2026-11-10T17:30:00+00:00',
  filters: { dealerId: null, outletId: null, from: null, to: null, dateBasis: 'Booking date' },
  scope: {
    projectWide: true,
    dealers: [
      { dealerId: 'd-utkal', dealer: 'Utkal Mahindra', outlets: [
        { outletId: 'o-cda', outlet: 'Utkal Mahindra - CDA' }, { outletId: 'o-barbil', outlet: 'Utkal Mahindra - BARBIL' }] },
      { dealerId: 'd-aditya', dealer: 'Aditya Motors', outlets: [{ outletId: 'o-jajpur', outlet: 'Aditya Motors - Jajpur' }] },
    ],
  },
  period: { first: '2026-09-02', last: '2026-11-09' },
  notes: ['A statement deal is a live Journey whose account statement is on file.'],
});

export const PRODUCTS: ProductInfo[] = [
  { key: 'finance', label: 'Finance', how: 'A finance record stands on the Journey.' },
  { key: 'insurance', label: 'In-house insurance', how: 'The statement charges the premium.' },
  { key: 'accessories', label: 'Accessories', how: 'The statement charges accessories.' },
  { key: 'fastag', label: 'FASTag', how: 'The statement charges FASTag.' },
  { key: 'rsa', label: 'RSA', how: 'The statement charges roadside assistance.' },
  { key: 'extendedWarranty', label: 'Extended warranty', how: 'The statement charges an extended warranty.' },
  { key: 'scrappage', label: 'Scrappage certificate', how: 'A Certificate of Deposit is on file.' },
];

function cells(deals: number, rates: number[], expected?: number[]): Record<string, ProductCell> {
  return Object.fromEntries(PRODUCTS.map((product, index) => {
    const sold = Math.round((rates[index] / 100) * deals);
    const cell: ProductCell = {
      count: sold, percent: deals ? Math.round((sold / deals) * 1000) / 10 : null,
      amount: product.key === 'scrappage' ? null : sold * 20000, typical: product.key === 'scrappage' ? null : 20000,
    };
    if (expected) {
      cell.expected = Math.round((expected[index] / 100) * deals * 10) / 10;
      cell.gap = Math.round((sold - cell.expected) * 10) / 10;
    }
    return [product.key, cell];
  }));
}

const NETWORK_RATES = [86, 67, 72, 36, 27, 12, 23];

export const penetration: PenetrationInsight = {
  ...envelope('penetration'),
  basis: { liveJourneys: 1253, statementDeals: 623, withoutStatement: 630, thinBelow: 10 },
  products: PRODUCTS,
  network: { deals: 623, products: cells(623, NETWORK_RATES) },
  dealers: [
    { key: 'd-utkal', label: 'Utkal Mahindra', parent: null, deals: 376, thin: false, products: cells(376, [88, 65, 70, 37, 26, 13, 20], NETWORK_RATES) },
    { key: 'd-aditya', label: 'Aditya Motors', parent: null, deals: 123, thin: false, products: cells(123, [88, 58, 76, 16, 41, 20, 26], NETWORK_RATES) },
  ],
  outlets: [
    { key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', deals: 67, thin: false, products: cells(67, [88, 70, 66, 16, 6, 7, 27], NETWORK_RATES) },
    { key: 'o-barbil', label: 'Utkal Mahindra - BARBIL', parent: 'Utkal Mahindra', deals: 40, thin: false, products: cells(40, [65, 78, 90, 85, 93, 50, 0], NETWORK_RATES) },
    { key: 'o-jajpur', label: 'Aditya Motors - Jajpur', parent: 'Aditya Motors', deals: 50, thin: false, products: cells(50, [90, 46, 80, 12, 48, 26, 16], NETWORK_RATES) },
    { key: 'o-small', label: 'Aditya Motors - Kendrapara', parent: 'Aditya Motors', deals: 4, thin: true, products: cells(4, [100, 50, 50, 0, 25, 0, 0], NETWORK_RATES) },
  ],
  models: [
    { key: 'MAXX HD', label: 'MAXX HD', parent: 'CV', deals: 151, thin: false, products: cells(151, [91, 50, 60, 7, 15, 1, 0]) },
    { key: 'XUV3XO', label: 'XUV3XO', parent: 'PV', deals: 74, thin: false, products: cells(74, [80, 81, 85, 51, 32, 19, 49]) },
    { key: 'Model not resolved', label: 'Model not resolved', parent: null, deals: 72, thin: false, products: cells(72, [79, 69, 70, 50, 28, 18, 11]) },
  ],
  districts: [
    { key: 'KRD', label: 'Khordha', parent: null, deals: 116, thin: false, products: cells(116, [88, 65, 70, 39, 18, 8, 32], NETWORK_RATES) },
    { key: '-', label: 'District not read', parent: null, deals: 116, thin: false, products: cells(116, [76, 60, 68, 49, 27, 11, 26], NETWORK_RATES) },
  ],
};

export const sales: SalesInsight = {
  ...envelope('sales'),
  basis: { liveJourneys: 1253, thinBelow: 10, bookingDateRead: 1088, priceInDoubt: 2, modelNotResolved: 313, deliveryDateInDoubt: 1 },
  network: {
    journeys: 1253, sharePercent: 100, deliveryStarted: 795, delivered: 269, statementDeals: 623, billedDeals: 671,
    billedValue: 890_990_332, typicalExShowroom: 1_091_500, typicalDaysToDeliver: 9, daysMeasuredOn: 241,
  },
  months: [{ month: '2026-09', booked: 186, delivered: 12 }, { month: '2026-10', booked: 780, delivered: 174 }, { month: '2026-11', booked: 287, delivered: 83 }],
  daysToDeliverBands: [
    { band: 'Within 7 days', deals: 104 }, { band: '8–15 days', deals: 71 }, { band: '16–30 days', deals: 44 },
    { band: '31–60 days', deals: 18 }, { band: 'Over 60 days', deals: 4 },
  ],
  dealers: [
    { key: 'd-utkal', label: 'Utkal Mahindra', parent: null, thin: false, journeys: 660, sharePercent: 52.7, deliveryStarted: 443, delivered: 173,
      statementDeals: 376, billedDeals: 386, billedValue: 517_130_928, typicalExShowroom: 1_044_500, typicalDaysToDeliver: 8, daysMeasuredOn: 150 },
  ],
  outlets: [
    { key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', thin: false, journeys: 114, sharePercent: 9.1, deliveryStarted: 80, delivered: 31,
      statementDeals: 67, billedDeals: 66, billedValue: 94_000_000, typicalExShowroom: 1_150_000, typicalDaysToDeliver: 11, daysMeasuredOn: 28 },
    { key: 'o-small', label: 'Aditya Motors - Kendrapara', parent: 'Aditya Motors', thin: true, journeys: 5, sharePercent: 0.4, deliveryStarted: 1, delivered: 0,
      statementDeals: 1, billedDeals: 1, billedValue: 1_012_000, typicalExShowroom: 1_012_000, typicalDaysToDeliver: null, daysMeasuredOn: 0 },
  ],
  models: [
    { key: 'MAXX HD', label: 'MAXX HD', parent: 'CV', thin: false, journeys: 240, sharePercent: 19.2, deliveryStarted: 170, delivered: 60,
      statementDeals: 151, billedDeals: 142, billedValue: 144_480_598, typicalExShowroom: 1_017_469, typicalDaysToDeliver: 7, daysMeasuredOn: 52 },
  ],
  categories: [
    { key: 'PV', label: 'PV', parent: null, thin: false, journeys: 538, sharePercent: 42.9, deliveryStarted: 330, delivered: 120,
      statementDeals: 300, billedDeals: 310, billedValue: 480_000_000, typicalExShowroom: 1_400_000, typicalDaysToDeliver: 10, daysMeasuredOn: 110 },
  ],
};

const verdicts = (over: number, kit: number, unknown: number, under: number) => ({
  OVER_ENTITLEMENT: { lines: 142, journeys: 134, amount: over },
  KIT_AS_CASH: { lines: 73, journeys: 73, amount: kit },
  ENTITLEMENT_UNKNOWN: { lines: 258, journeys: 193, amount: unknown },
  UNDER_ENTITLEMENT: { lines: 87, journeys: 80, amount: under },
});

export const discounts: DiscountInsight = {
  ...envelope('discounts'),
  basis: { liveJourneys: 1253, billedDeals: 673, pricedDeals: 671, priceNotRead: 0, priceInDoubt: 2, notYetCalculated: 6, thinBelow: 10,
    outlierPercent: 5, outlierAmount: 200000, toleranceRupees: 100 },
  verdictLabels: { OVER_ENTITLEMENT: 'Over entitlement', KIT_AS_CASH: 'Kit given as cash', ENTITLEMENT_UNKNOWN: 'Entitlement unknown', UNDER_ENTITLEMENT: 'Under entitlement' },
  network: { deals: 673, discountedDeals: 409, given: 15_397_156, exShowroom: 890_990_332, givenPercent: 1.73, perDeal: 22_878,
    typicalDiscount: 25_000, verdicts: verdicts(1_266_369, 1_317_881, 7_837_078, 684_275) },
  concentration: { discountedDeals: 408, aboveMark: 57, aboveMarkGiven: 6_666_856, aboveMarkSharePercent: 43.4 },
  byDiscount: [
    { key: 'CASH_DISCOUNT', label: 'Consumer offer / scheme discount', deals: 220, given: 6_355_644, sharePercent: 41.3, over: 248_012, kitAsCash: 1_317_881, unknown: 2_759_616 },
    { key: 'CORPORATE_PRIVILEGE', label: 'Corporate discount', deals: 104, given: 2_743_029, sharePercent: 17.8, over: 0, kitAsCash: 0, unknown: 2_644_229 },
  ],
  unknownByReason: [
    { reason: 'the corporate category is still to be confirmed', key: 'CORPORATE_PRIVILEGE', label: 'Corporate discount', lines: 70, amount: 2_239_355 },
    { reason: 'the scheme master is not matched to this vehicle', key: 'CASH_DISCOUNT', label: 'Consumer offer / scheme discount', lines: 58, amount: 1_449_919 },
  ],
  dealers: [
    { key: 'd-aditya', label: 'Aditya Motors', parent: null, thin: false, deals: 118, discountedDeals: 94, given: 3_826_079, exShowroom: 160_718_460,
      givenPercent: 2.38, perDeal: 32_424, typicalDiscount: 30_000, verdicts: verdicts(236_348, 170_881, 2_174_526, 90_000),
      expectedGiven: 2_900_000, aboveExpected: 926_079, index: 1.32 },
  ],
  outlets: [
    { key: 'o-jajpur', label: 'Aditya Motors - Jajpur', parent: 'Aditya Motors', thin: false, deals: 43, discountedDeals: 38, given: 2_238_236, exShowroom: 50_600_000,
      givenPercent: 4.42, perDeal: 52_052, typicalDiscount: 41_000, verdicts: verdicts(126_240, 130_000, 1_597_067, 0),
      expectedGiven: 1_100_000, aboveExpected: 1_138_236, index: 2.03 },
    { key: 'o-barbil', label: 'Utkal Mahindra - BARBIL', parent: 'Utkal Mahindra', thin: false, deals: 61, discountedDeals: 9, given: 170_800, exShowroom: 74_000_000,
      givenPercent: 0.23, perDeal: 2_800, typicalDiscount: 12_000, verdicts: verdicts(38_551, 0, 50_227, 0),
      expectedGiven: 1_300_000, aboveExpected: -1_129_200, index: 0.13 },
  ],
  models: [
    { key: 'SCORPIO CLASSIC', label: 'SCORPIO CLASSIC', parent: 'PV', thin: false, deals: 52, discountedDeals: 46, given: 2_746_558, exShowroom: 83_326_724,
      givenPercent: 3.3, perDeal: 52_818, typicalDiscount: 55_000, verdicts: verdicts(227_567, 1_032_999, 787_990, 0) },
  ],
  outliers: [
    { journeyId: 'j-1', reference: 'MO-000123', customer: 'A Customer', dealer: 'Aditya Motors', outlet: 'Aditya Motors - Jajpur', pc: 'A PC',
      model: 'NEW SCORPIO N', variant: 'Z8 L', bookingDate: '2026-10-12', exShowroom: 2_100_000, given: 765_000, percent: 36.4,
      lines: [{ key: 'CORPORATE_PRIVILEGE', label: 'Corporate discount', amount: 765_000 }], verdicts: ['ENTITLEMENT_UNKNOWN'] },
    { journeyId: 'j-2', reference: 'MO-000456', customer: 'B Customer', dealer: 'Utkal Mahindra', outlet: 'Utkal Mahindra - CDA', pc: 'B PC',
      model: 'THAR ROXX', variant: null, bookingDate: '2026-10-20', exShowroom: 91_361_999, given: 800_000, percent: null,
      lines: [{ key: 'EXCHANGE_BONUS', label: 'Exchange bonus', amount: 730_000 }, { key: 'CASH_DISCOUNT', label: 'Consumer offer / scheme discount', amount: 70_000 }],
      verdicts: [] },
  ],
  decisions: {
    rules: [
      { rule: 'EXCESS_DISCOUNT', raised: 477, open: 163, closedOnRecheck: 310, confirmedBreach: 3, falsePositive: 1, other: 0 },
      { rule: 'KIT_GIVEN_AS_CASH', raised: 41, open: 39, closedOnRecheck: 0, confirmedBreach: 1, falsePositive: 1, other: 0 },
    ],
    raised: 518, decidedByAPerson: 6,
    remarks: [{ journeyId: 'j-9', rule: 'EXCESS_DISCOUNT', decision: 'CONFIRMED_BREACH', remark: '2000 extra discount given by the dealer' }],
  },
};

const channel = (deals: number, inhouse: number, outside: number) => ({
  deals,
  channels: { INHOUSE_STATEMENT: inhouse - 13, INHOUSE_DEALER_CODE: 13, INHOUSE_INVOICE: 0, INHOUSE_CONFIRMED: 0, EXTERNAL_CONFIRMED: 5,
    OUTSIDE_UNCONFIRMED: outside - 5, NO_POLICY: deals - inhouse - outside },
  inhouse, inhousePercent: Math.round((inhouse / deals) * 1000) / 10, inhousePremium: inhouse * 48_000,
  outside, outsidePercent: Math.round((outside / deals) * 1000) / 10, outsidePremium: outside * 36_000, noPolicy: deals - inhouse - outside,
});

export const insurance: InsuranceInsight = {
  ...envelope('insurance'),
  basis: { liveJourneys: 1253, statementDeals: 623, policiesOnFile: 573, policiesWithCovers: 310, renewalDatesRead: 540, thinBelow: 10 },
  channelLabels: {
    INHOUSE_STATEMENT: 'In-house: premium on the statement', INHOUSE_DEALER_CODE: "In-house: dealer's code on the policy",
    INHOUSE_INVOICE: 'In-house: premium on the dealer invoice', INHOUSE_CONFIRMED: 'In-house: confirmed by the PC',
    EXTERNAL_CONFIRMED: 'Outside: confirmed by the PC', OUTSIDE_UNCONFIRMED: "Outside the dealer's code, not confirmed",
    NO_POLICY: 'No policy on file',
  },
  network: channel(623, 415, 163),
  dealers: [{ key: 'd-utkal', label: 'Utkal Mahindra', parent: null, thin: false, ...channel(376, 245, 110) }],
  outlets: [
    { key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', thin: false, ...channel(67, 47, 18) },
    { key: 'o-jajpur', label: 'Aditya Motors - Jajpur', parent: 'Aditya Motors', thin: false, ...channel(50, 23, 25) },
  ],
  models: [{ key: 'MAXX HD', label: 'MAXX HD', parent: 'CV', thin: false, ...channel(151, 76, 60) }],
  outsideAgents: [
    { key: 'code:PS000041087', agent: 'An Agent', code: 'PS0000041087', codes: ['PS0000041087', 'PS000041087'], policies: 19, premium: 579_604, confirmedOutside: 2,
      dealers: ['Utkal Mahindra'], outlets: [{ outlet: 'Utkal Mahindra - CDA', policies: 12 }, { outlet: 'Utkal Mahindra - BARBIL', policies: 7 }],
      journeys: [{ journeyId: 'j-3', reference: 'MO-000789' }] },
    { key: 'none', agent: 'No agent or code on the policy', code: null, codes: [], policies: 28, premium: 1_020_000, confirmedOutside: 0,
      dealers: ['Aditya Motors'], outlets: [{ outlet: 'Aditya Motors - Jajpur', policies: 28 }], journeys: [] },
  ],
  dealerCodeOffStatement: { policies: 9, premium: 622_813,
    journeys: [{ journeyId: 'j-4', reference: 'MO-000321', dealer: 'Aditya Motors', outlet: 'Aditya Motors - Jajpur', premium: 71_000 }] },
  insurers: [
    { insurer: 'Tata AIG', policies: 180, premium: 8_100_000, inhouse: 150, outside: 30, sharePercent: 31.4 },
    { insurer: 'ICICI Lombard', policies: 120, premium: 5_300_000, inhouse: 70, outside: 50, sharePercent: 20.9 },
  ],
  covers: [{ cover: 'Zero depreciation', policies: 262, percent: 84.5 }, { cover: 'Engine protect', policies: 190, percent: 61.3 }],
  renewals: [{ month: '2027-10', policies: 330, premium: 14_800_000, inhouse: 240, outside: 90 }],
};

export const finance: FinanceInsight = {
  ...envelope('finance'),
  basis: { liveJourneys: 1253, statementDeals: 623, thinBelow: 10, gapRupees: 5000, financedAllLiveJourneys: 567 },
  summary: { deals: 623, financed: 538, percent: 86.4, loanKnown: 412, loanTotal: 474_000_000, typicalLoan: 990_000, typicalLoanToValue: 84.1,
    loanAboveExShowroom: 53, loanBelowSixtyPercent: 48, loanToValueKnown: 405, sanctionAndDisbursalRead: 176, sanctionDiffersFromDisbursal: 74,
    shortDisbursed: { deals: 61, amount: 4_040_768 } },
  lenders: [
    { lender: 'Mahindra Finance', deals: 111, sharePercent: 20.6, loanKnown: 68, loanTotal: 70_800_000, typicalLoan: 1_000_000, typicalLoanToValue: 85,
      dealers: { 'Utkal Mahindra': 62, 'Aditya Motors': 34 } },
    { lender: 'State Bank of India', deals: 76, sharePercent: 14.1, loanKnown: 67, loanTotal: 90_100_000, typicalLoan: 1_300_000, typicalLoanToValue: 85,
      dealers: { 'Utkal Mahindra': 43 } },
  ],
  loanToValueBands: [
    { band: 'Under 60%', deals: 48 }, { band: '60–75%', deals: 60 }, { band: '75–85%', deals: 104 }, { band: '85–95%', deals: 110 },
    { band: '95–100%', deals: 30 }, { band: 'Above ex-showroom', deals: 53 },
  ],
  loanBands: [{ band: 'Under ₹5 lakh', deals: 20 }, { band: '₹5–10 lakh', deals: 190 }, { band: '₹10–15 lakh', deals: 120 }, { band: '₹15–20 lakh', deals: 60 }, { band: '₹20 lakh and above', deals: 22 }],
  dealers: [{ key: 'd-utkal', label: 'Utkal Mahindra', parent: null, thin: false, deals: 376, financed: 330, percent: 87.8, loanKnown: 250, loanTotal: 280_000_000, typicalLoan: 980_000, typicalLoanToValue: 84 }],
  outlets: [{ key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', thin: false, deals: 67, financed: 59, percent: 88.1, loanKnown: 44, loanTotal: 50_000_000, typicalLoan: 1_050_000, typicalLoanToValue: 86 }],
  models: [{ key: 'MAXX HD', label: 'MAXX HD', parent: 'CV', thin: false, deals: 151, financed: 137, percent: 90.7, loanKnown: 100, loanTotal: 86_000_000, typicalLoan: 860_000, typicalLoanToValue: 85 }],
  sanctionGaps: [{ journeyId: 'j-5', reference: 'MO-000654', customer: 'C Customer', dealer: 'Utkal Mahindra', outlet: 'Utkal Mahindra - CDA',
    lender: 'HDFC Bank', sanctioned: 900_000, disbursed: 800_000, short: 100_000 }],
};

export const scrappage: ScrappageInsight = {
  ...envelope('scrappage'),
  basis: { liveJourneys: 1253, statementDeals: 623, thinBelow: 10, gapRupees: 5000 },
  summary: { journeysWithCertificate: 146, statementDealsWithCertificate: 144, percentOfStatementDeals: 23.1, certificates: 187, transferred: 141,
    original: 46, bonusGiven: 8, certificateWithoutBonus: 138, oldVehiclesOutsideState: 145, oldVehiclesStateRead: 146, certificatesUsedTwice: 2,
    estimatedRoadTaxSaved: 4_770_000, roadTaxSavedOnDeals: 116, chargedAbovePaid: { deals: 6, amount: 2_362_459 } },
  states: [{ state: 'Delhi', certificates: 50 }, { state: 'Uttar Pradesh', certificates: 39 }, { state: 'Haryana', certificates: 33 }],
  roadTaxEffect: [
    { band: 'Under ₹10 lakh', withCertificate: 19, withoutCertificate: 18, taxPercentWith: 6, taxPercentWithout: 8, savingPerDeal: 19_574, saving: 371_906 },
    { band: '₹10–20 lakh', withCertificate: 72, withoutCertificate: 38, taxPercentWith: 7.5, taxPercentWithout: 10, savingPerDeal: 41_333, saving: 2_976_003 },
    { band: '₹20 lakh and above', withCertificate: 0, withoutCertificate: 0, taxPercentWith: null, taxPercentWithout: null, savingPerDeal: null, saving: null },
  ],
  dealers: [{ key: 'd-utkal', label: 'Utkal Mahindra', parent: null, thin: false, deals: 376, certificates: 64, percent: 17, bonusGiven: 5 }],
  outlets: [{ key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', thin: false, deals: 67, certificates: 18, percent: 26.9, bonusGiven: 1 }],
  models: [{ key: 'NEW SCORPIO N', label: 'NEW SCORPIO N', parent: 'PV', thin: false, deals: 44, certificates: 28, percent: 63.6, bonusGiven: 2 }],
  usedTwice: [{ certificateNumber: 'COD/2026/0001', journeys: [{ journeyId: 'j-6', reference: 'MO-1', customer: 'D Customer', outlet: 'CDA' }, { journeyId: 'j-7', reference: 'MO-2', customer: 'E Customer', outlet: 'CDA' }] }],
  register: [{ journeyId: 'j-6', reference: 'MO-1', customer: 'D Customer', dealer: 'Utkal Mahindra', outlet: 'Utkal Mahindra - CDA', model: 'NEW SCORPIO N',
    bookingDate: '2026-10-03', certificateNumber: 'COD/2026/0001', kind: 'TRANSFERRED', oldRegistration: 'DL 3C AB 1234', state: 'Delhi', facility: null,
    certificates: 1, bonusGiven: 0, exShowroom: 1_600_000, roadTaxPaid: 120_000, roadTaxPercent: 7.5, chargedOnStatement: 182_000, paidAtRto: 122_000,
    chargedAbovePaid: 60_000 }],
};

const pay = (journeys: number, amount: number, cashPercent: number) => ({
  journeys, journeysWithReceipts: Math.round(journeys * 0.85), receipts: journeys * 3, amount, cashReceipts: journeys, cashAmount: Math.round(amount * cashPercent / 100),
  cashPercent, journeysPayingCash: Math.round(journeys * 0.4), cashAboveLimit: 0, cashAboveLimitAmount: 0, cashAtLimit: 14, cashAtLimitAmount: 2_800_000,
  cashNearLimit: 35, cashNearLimitAmount: 6_800_000, journeysCashAboveLimitInAll: 9,
  modeNotRead: journeys, modeNotReadAmount: Math.round(amount * 0.09), modeNotReadPercent: 9.2,
});

export const payments: PaymentsInsight = {
  ...envelope('payments'),
  basis: { liveJourneys: 1253, cashLimit: 200000, nearLimitFrom: 190000, refunds: 0, refundAmount: 0 },
  network: pay(1253, 746_427_286, 4.5),
  modes: [
    { mode: 'RTGS', label: 'RTGS', receipts: 575, journeys: 380, amount: 405_997_028, sharePercent: 54.4, typical: 700_000 },
    { mode: 'CASH', label: 'Cash', receipts: 613, journeys: 422, amount: 33_564_444, sharePercent: 4.5, typical: 40_000 },
    { mode: 'OTHERS', label: 'Mode not read', receipts: 1102, journeys: 624, amount: 68_775_233, sharePercent: 9.2, typical: 30_000 },
  ],
  dealers: [{ key: 'd-utkal', label: 'Utkal Mahindra', parent: null, ...pay(660, 420_000_000, 4.1) }],
  outlets: [{ key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', ...pay(114, 80_000_000, 6.3) }],
  cashAboveLimit: [],
  cashAroundLimit: [
    { journeyId: 'j-8', reference: 'MO-777', customer: 'F Customer', dealer: 'Utkal Mahindra', outlet: 'Utkal Mahindra - CDA', pc: 'A PC',
      amount: 200_000, band: 'AT', date: '2026-10-14', receiptNumber: 'R-77' },
    { journeyId: 'j-9', reference: 'MO-778', customer: 'G Customer', dealer: 'Aditya Motors', outlet: 'Aditya Motors - Jajpur', pc: 'B PC',
      amount: 199_000, band: 'NEAR', date: '2026-10-20', receiptNumber: 'R-90' },
  ],
  cashAboveLimitInAll: [{ journeyId: 'j-8', reference: 'MO-777', customer: 'F Customer', dealer: 'Utkal Mahindra', outlet: 'Utkal Mahindra - CDA', pc: 'A PC',
    cashTotal: 310_000, cashReceipts: 2, largestReceipt: 260_000 }],
};

export const catchment: CatchmentInsight = {
  ...envelope('catchment'),
  basis: { liveJourneys: 1253, withPin: 1008, withDistrict: 1010, withoutPlace: 240, pins: 412, districts: 34, thinBelow: 10 },
  products: PRODUCTS,
  districts: [
    { key: 'KRD', label: 'Khordha', parent: null, journeys: 215, sharePercent: 17.2, pins: 45, statementDeals: 116, thin: false,
      products: cells(116, [88, 65, 70, 39, 18, 8, 32]), outlets: [{ outlet: 'Utkal Mahindra - MANCHESWAR', journeys: 120 }, { outlet: 'Shivnath Motors - Tamando', journeys: 70 }] },
    { key: 'NGR', label: 'Nayagarh', parent: null, journeys: 21, sharePercent: 1.7, pins: 13, statementDeals: 0, thin: true, products: null, outlets: [{ outlet: 'Shivnath Motors - Tamando', journeys: 21 }] },
  ],
  pins: [{ key: '752001', label: '752001', parent: 'Khordha', journeys: 9, sharePercent: 0.7, pins: 1, statementDeals: 5, thin: true,
    products: cells(5, [80, 60, 60, 40, 20, 0, 20]), outlets: [{ outlet: 'Utkal Mahindra - CDA', journeys: 9 }] }],
  map: {
    boundaries: [{ key: 'odisha-district', type: 'DISTRICT' }, { key: 'odisha-pin', type: 'PIN' }],
    cells: [
      { pin: '751010', onMap: true, district: 'Khordha', dealerId: 'd-utkal', dealer: 'Utkal Mahindra', outletId: 'o-cda', outlet: 'Utkal Mahindra - CDA', model: 'MAXX HD',
        journeys: 12, delivered: 5, deals: 8, products: { finance: 7, insurance: 5, accessories: 6, fastag: 3, rsa: 2, extendedWarranty: 1, scrappage: 0 } },
      { pin: '751010', onMap: true, district: 'Khordha', dealerId: 'd-aditya', dealer: 'Aditya Motors', outletId: 'o-jajpur', outlet: 'Aditya Motors - Jajpur', model: 'XUV3XO',
        journeys: 4, delivered: 1, deals: 2, products: { finance: 2, insurance: 1, accessories: 2, fastag: 1, rsa: 0, extendedWarranty: 0, scrappage: 1 } },
      { pin: '753014', onMap: true, district: 'Cuttack', dealerId: 'd-utkal', dealer: 'Utkal Mahindra', outletId: 'o-cda', outlet: 'Utkal Mahindra - CDA', model: 'XUV3XO',
        journeys: 9, delivered: 4, deals: 6, products: { finance: 5, insurance: 4, accessories: 5, fastag: 2, rsa: 1, extendedWarranty: 1, scrappage: 2 } },
      { pin: null, onMap: false, district: 'Cuttack', dealerId: 'd-aditya', dealer: 'Aditya Motors', outletId: 'o-jajpur', outlet: 'Aditya Motors - Jajpur', model: 'MAXX HD',
        journeys: 3, delivered: 0, deals: 1, products: { finance: 1, insurance: 0, accessories: 1, fastag: 0, rsa: 0, extendedWarranty: 0, scrappage: 0 } },
      { pin: '831001', onMap: false, district: 'West Singhbhum', dealerId: 'd-utkal', dealer: 'Utkal Mahindra', outletId: 'o-barbil', outlet: 'Utkal Mahindra - BARBIL', model: 'MAXX HD',
        journeys: 2, delivered: 1, deals: 1, products: { finance: 1, insurance: 1, accessories: 1, fastag: 1, rsa: 1, extendedWarranty: 0, scrappage: 0 } },
    ],
    localities: { '751010': ['RASULGARH', 'MANCHESWAR'], '753014': ['CDA'] },
    outlets: [
      { outletId: 'o-cda', outlet: 'Utkal Mahindra - CDA', dealerId: 'd-utkal', dealer: 'Utkal Mahindra', pin: '753014' },
      { outletId: 'o-jajpur', outlet: 'Aditya Motors - Jajpur', dealerId: 'd-aditya', dealer: 'Aditya Motors', pin: '755015' },
    ],
    offMap: 2,
  },
  outlets: [{ key: 'o-cda', label: 'Utkal Mahindra - CDA', parent: 'Utkal Mahindra', journeys: 114, located: 96, districts: 9, homeDistrict: 'Cuttack',
    homeSharePercent: 71.9, topDistricts: [{ district: 'Cuttack', journeys: 69, percent: 71.9 }, { district: 'Jagatsinghpur', journeys: 12, percent: 12.5 }] }],
};
