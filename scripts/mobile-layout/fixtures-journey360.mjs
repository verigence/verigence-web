// Mock API responses for the mobile layout harness: journey360 screens. Same tuple shape as fixtures.mjs.
// Journey 360 overview (every tab) and the audit (compliance) report for journey-mobile-1.
// Shapes follow src/services/audit-core/uc03P2.ts (P2Journey360, P2SectionMap, P2Pricing ...).
// eslint-disable-next-line no-unused-vars
import { TENANT, today, iso, outlets } from './fixtures-base.mjs';

// ── helpers ─────────────────────────────────────────────────────────────────
const amt = (n) => (n === null || n === undefined ? null : Number(n).toFixed(2));
const sum = (...xs) => xs.reduce((a, x) => a + (x ?? 0), 0);
const dayOffset = (n) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const at = (n, t = '10:15:00') => iso(dayOffset(n), t);
/** A journey-scoped Audit Core path, e.g. J('/360/deal'). Query strings allowed. */
const J = (suffix) => new RegExp(`/p2/v1/tenants/[^/]+/journeys/[^/]+${suffix}(\\?|$)`);

const OUTLET = outlets[1];
const CUSTOMER = 'Bibhutibhushan Pradhan';
const VEHICLE = 'Mahindra XUV 3XO AX7 L Turbo AT Diesel Dual Tone';
const REFERENCE = 'MAH-OD/BBS/2026/BK-004412';
const SKU = 'XUV3XO-AX7L-TDAT-DT-NBLK';
const BOOKING_DATE = dayOffset(24);
const INVOICE_DATE = dayOffset(3);

// ── the deal ────────────────────────────────────────────────────────────────
const src = (document, documentType, amount, documentId = null) => ({ document, documentType, amount: amt(amount), documentId });

/** A price-sheet line; variance is billed less standard where both price it. */
function line(key, label, standard, booking, billed, extra = {}) {
  const variance = standard !== null && billed !== null && billed !== standard ? billed - standard : null;
  return {
    key, label, opted: null, standard: amt(standard), booking: amt(booking), billed: amt(billed),
    billedFrom: billed !== null ? 'document' : null, current: amt(billed), ledger: amt(billed), quote: amt(standard),
    effective: amt(billed ?? booking), effectiveSource: billed !== null ? 'NDC' : 'booking', variance: amt(variance),
    bookingVsBilled: booking !== null && billed !== null && booking !== billed ? amt(billed - booking) : null,
    flags: [], awaiting: null,
    sources: [
      ...(booking !== null ? [src('Booking docket', 'booking_form', booking, 'doc-booking-form')] : []),
      ...(billed !== null ? [src('NDC (account statement)', 'account_statement', billed, 'doc-ndc'),
        src('Customer invoice (DMS) INV/BBS/26-27/011873', 'customer_invoice_dms', billed, 'doc-inv-vehicle')] : []),
    ],
    ...extra,
  };
}

const roadTax = line('ROAD_TAX_REGISTRATION', 'Road tax + registration', 178680, 178680, 181230, {
  flags: ['ABOVE_STANDARD', 'INVOICES_DISAGREE'],
});
const rows = {
  VEHICLE: [
    line('EX_SHOWROOM', 'Ex-showroom price', 1489000, 1489000, 1489000),
    line('TCS', 'TCS @ 1% (Sec. 206C(1F))', 14890, 14890, 14890),
  ],
  REGISTRATION: [
    roadTax,
    line('ROAD_TAX', 'Road tax (Odisha, 12% of ex-showroom)', 175680, 175680, 178230, { partOf: 'ROAD_TAX_REGISTRATION', current: null }),
    line('REGISTRATION_FEE', 'Registration + HSRP + smart card', 3000, 3000, 3000, { partOf: 'ROAD_TAX_REGISTRATION', current: null }),
  ],
  INSURANCE: [
    line('INSURANCE_PREMIUM', 'Insurance premium (1+3 yr bumper-to-bumper)', 62450, 60000, 58920, {
      opted: { taken: true, source: 'insurance' }, flags: ['BELOW_STANDARD', 'BOOKING_VS_BILLED'],
    }),
  ],
  ACCESSORIES: [
    line('ACCESSORIES', 'Accessories kit (Dual Tone styling pack)', 25000, 25000, 18450, {
      opted: { taken: true, source: 'invoice' }, flags: ['BELOW_STANDARD'], invoiced: amt(24500), freeByInvoice: amt(6050),
    }),
  ],
  PROTECTION: [
    line('EXTENDED_WARRANTY', 'Extended warranty (4th & 5th year, 1,50,000 km)', 18999, 18999, 18999, { opted: { taken: true, source: 'invoice' } }),
    line('RSA', 'Road side assistance (3 years)', 2999, 2999, null, {
      opted: { taken: true, source: 'billed' }, flags: ['AWAITING_DOCUMENT', 'NOT_ON_STATEMENT'], awaiting: 'RSA invoice',
    }),
    line('FASTAG', 'FASTag', 500, 500, 500),
  ],
};
const counted = (list) => list.filter((r) => !r.partOf);
const totalOf = (list, k) => amt(sum(...counted(list).map((r) => (r[k] === null ? null : Number(r[k])))));
const category = (code, label, list, extra = {}) => ({
  code, label, components: list, ...extra,
  totals: { standard: totalOf(list, 'standard'), booking: totalOf(list, 'booking'), billed: totalOf(list, 'billed'), ledger: totalOf(list, 'ledger'), effective: totalOf(list, 'effective') },
});
const categories = [
  category('VEHICLE', 'Vehicle', rows.VEHICLE),
  category('REGISTRATION', 'Registration (RTO)', rows.REGISTRATION),
  category('INSURANCE', 'Insurance', rows.INSURANCE),
  category('ACCESSORIES', 'Accessories', rows.ACCESSORIES),
  category('PROTECTION', 'Warranty & protection plans', rows.PROTECTION),
];

function discount(key, label, entitled, booking, billed, extra = {}) {
  const variance = entitled !== null && billed !== null && billed !== entitled ? billed - entitled : null;
  return {
    key, label, opted: { taken: billed !== null && billed > 0, source: 'billed' },
    entitled: amt(entitled), booking: amt(booking), billed: amt(billed), billedFrom: billed !== null ? 'document' : null,
    current: amt(billed), ledger: amt(billed), effective: amt(billed ?? booking), variance: amt(variance),
    flags: [], eligibility: 'ELIGIBLE', evidenceStatus: 'ON_FILE', proof: null, awaiting: null,
    scheme: null,
    sources: [
      ...(booking !== null ? [src('Booking docket', 'booking_form', booking, 'doc-booking-form')] : []),
      ...(billed !== null ? [src('NDC (account statement)', 'account_statement', billed, 'doc-ndc')] : []),
    ],
    ...extra,
  };
}
const discounts = [
  discount('CONSUMER_OFFER', 'Consumer offer', 40000, 40000, 40000, {
    scheme: { code: 'MAH-OD-NOV26-CO-3XO', name: 'XUV 3XO November consumer offer', category: 'CONSUMER', version: 2,
      validFrom: dayOffset(36), validTo: dayOffset(-23), combinability: 'COMBINABLE_WITH_ALL' },
  }),
  discount('EXCHANGE_BONUS', 'Exchange bonus', 25000, 25000, 30000, {
    flags: ['OVER_ENTITLEMENT'],
    scheme: { code: 'MAH-OD-NOV26-EX', name: 'Exchange bonus (any make, 3+ yrs old)', category: 'EXCHANGE', version: 1,
      validFrom: dayOffset(36), validTo: dayOffset(-23), combinability: 'NOT_WITH_SCRAPPAGE' },
    proof: { documentType: 'old_vehicle_rc', document: 'Old vehicle RC', onFile: true },
    paidByCreditNotes: [{ documentId: 'doc-cn-1', number: 'CN/BBS/26-27/00418', date: INVOICE_DATE, amount: amt(30000) }],
  }),
  discount('CORPORATE_PRIVILEGE', 'Corporate privilege (Govt. employee)', 5000, 5000, 7500, {
    flags: ['OVER_ENTITLEMENT'], eligibility: 'PROOF_MISSING', evidenceStatus: 'MISSING',
    proof: { documentType: 'employee_id_card', document: 'Employee ID card or salary slip', onFile: false },
    scheme: { code: 'MAH-CPP-26', name: 'Corporate privilege policy 2026', category: 'CORPORATE', version: 4,
      validFrom: dayOffset(220), validTo: null, combinability: 'COMBINABLE_WITH_ALL' },
  }),
  discount('DEALER_CASH', 'Dealer cash discount', null, 10000, 15000, {
    billedFrom: 'invoice', current: null, flags: ['BOOKING_VS_BILLED'], eligibility: null,
    sources: [src('Booking docket', 'booking_form', 10000, 'doc-booking-form'),
      src('Tax invoice (Tally) TI/26-27/3318', 'tax_invoice_tally', 15000, 'doc-inv-tally')],
  }),
  discount('MANAGEMENT_REFERRAL', 'Management referral (MR)', null, null, null, {
    opted: { taken: false, source: 'tl' }, eligibility: null, sources: [],
    management: { opted: false, amount: null, reason: null, setBy: null, setByRole: null, setAt: null, task: null },
  }),
];

const grossOf = (k) => sum(...categories.map((c) => Number(c.totals[k] ?? 0)));
const discOf = (k) => sum(...discounts.map((d) => (d[k] === null ? 0 : Number(d[k]))));
const gross = { standard: grossOf('standard'), booking: grossOf('booking'), billed: grossOf('billed') };
const disc = { standard: discOf('entitled'), booking: discOf('booking'), current: discOf('current'), billed: discOf('billed') };
const net = { standard: gross.standard - disc.standard, booking: gross.booking - disc.booking, current: gross.billed - disc.current };

// Money received: customer receipts, the HDFC loan and the old vehicle taken in kind.
const RECEIPTS = 21000 + 250000 + 85000 + 100000;
const LOAN = 1050000;
const OLD_VEHICLE = 195000;
const PAID = RECEIPTS + LOAN + OLD_VEHICLE;

const dealSummary = {
  gross: { standard: amt(gross.standard), booking: amt(gross.booking), current: amt(gross.billed), billed: amt(gross.billed), ledger: amt(gross.billed) },
  discounts: { standard: amt(disc.standard), booking: amt(disc.booking), current: amt(disc.current), billed: amt(disc.billed) },
  net: { standard: amt(net.standard), booking: amt(net.booking), current: amt(net.current) },
  variance: { bookingVsStandard: null, currentVsStandard: amt(net.current - net.standard), billedVsBooking: null },
  invoicedComponents: 7,
  invoiceIsSourceOfTruth: false,
  statementNotRead: [],
  figuresNotRead: [
    { documentId: 'doc-rsa-cover', documentType: 'rsa_certificate', document: 'RSA certificate (Mahindra Assist)', pageNumber: 2, missing: ['Plan amount', 'Invoice number'] },
  ],
  deliveryStarted: true,
  billedSource: 'ACCOUNT_STATEMENT',
  components: 8,
  paid: {
    receipts: amt(RECEIPTS), loan: amt(LOAN), oldVehicle: amt(OLD_VEHICLE), total: amt(PAID),
    loanSource: 'HDFC Bank disbursement receipt', loanWithoutReceipt: false, loanUnknown: false, refunds: null,
  },
  payable: amt(net.current),
  balanceDue: amt(net.current - PAID),
};
const flaggedRows = [...categories.flatMap((c) => c.components), ...discounts].filter((r) => r.flags.length);

const deal = {
  sku: {
    skuCode: SKU, model: 'XUV 3XO', variant: 'AX7 L Turbo AT Diesel', colour: 'Nebula Blue with Stealth Black roof (Dual Tone)',
    category: 'PV', resolution: 'RESOLVED', method: 'INVOICE_MODEL_CODE', priceList: 'Mahindra Orissa retail price list Nov 2026',
    priceListVersion: 3, priceListEffectiveFrom: dayOffset(36),
  },
  categories,
  discounts,
  insurance: { source: 'INHOUSE', decidedBy: 'DOCUMENT', decidedAt: at(3, '16:40:00'), basis: 'Dealer MISP code MISP-OD-0042 on the policy',
    invoiceOnFile: true, vehicleInvoiced: true, inDeal: true },
  invoices: [
    { documentId: 'doc-inv-vehicle', documentType: 'customer_invoice_dms', label: 'Customer invoice (DMS)', number: 'INV/BBS/26-27/011873', date: INVOICE_DATE, total: amt(1503890), counted: true },
    { documentId: 'doc-inv-tally', documentType: 'tax_invoice_tally', label: 'Tax invoice (Tally)', number: 'TI/26-27/3318', date: INVOICE_DATE, total: amt(1503890), counted: false, sameInvoiceAs: ['doc-inv-vehicle'] },
    { documentId: 'doc-inv-acc', documentType: 'accessory_invoice_dms', label: 'Accessory invoice', number: 'ACC/BBS/26-27/2291', date: INVOICE_DATE, total: amt(24500), counted: true },
    { documentId: 'doc-inv-ew', documentType: 'ew_invoice', label: 'Extended warranty invoice', number: 'EW/MW/26/0918812', date: dayOffset(2), total: amt(18999), counted: true },
    { documentId: 'doc-cn-1', documentType: 'credit_note', label: 'Credit note', number: 'CN/BBS/26-27/00418', date: INVOICE_DATE, total: amt(30000) },
  ],
  creditNotes: [
    { documentId: 'doc-cn-1', number: 'CN/BBS/26-27/00418', date: INVOICE_DATE, amount: amt(30000), taxable: amt(25424), reason: null,
      issuedTo: CUSTOMER, benefit: { key: 'EXCHANGE_BONUS', label: 'Exchange bonus' }, benefitCandidates: [] },
    { documentId: 'doc-cn-2', number: 'CN/BBS/26-27/00421', date: dayOffset(2), amount: amt(5000), taxable: amt(4237), reason: null,
      issuedTo: CUSTOMER, benefit: null, benefitCandidates: ['CORPORATE_PRIVILEGE', 'LOYALTY_BONUS'] },
  ],
  declared: [
    { key: 'NET_PAYABLE', label: 'Net payable (on-road)', booking: amt(net.booking), billed: amt(net.current + 2550), ledger: amt(net.current), quote: amt(net.standard), sources: [] },
    { key: 'TOTAL_DISCOUNT', label: 'Total discount', booking: amt(disc.booking), billed: amt(disc.current), ledger: null, quote: amt(disc.standard), sources: [] },
  ],
  summary: dealSummary,
  flagged: flaggedRows.length,
};

// ── checks ──────────────────────────────────────────────────────────────────
const ctl = (code, label, category, status, reason, extra = {}) => ({
  code, label, category, severity: status === 'FAIL' ? 'HIGH' : 'MEDIUM', executor: 'AUDIT_CORE', status, reason,
  evaluatedAtUtc: at(0, '06:12:00'), ...extra,
});
const controls = {
  BOOKING: [
    ctl('BK_KYC_NAME_MATCH', 'Customer name on booking matches PAN', 'IDENTITY', 'PASS', 'Booking name and PAN name agree.', { leftValue: 'BIBHUTIBHUSHAN PRADHAN', rightValue: 'BIBHUTIBHUSHAN PRADHAN' }),
    ctl('BK_MIN_BOOKING_AMOUNT', 'Minimum booking amount received', 'PAYMENT', 'PASS', 'Receipts on file reach the minimum booking amount.', { leftValue: '21000.00', rightValue: '21000.00' }),
    ctl('BK_DUPLICATE_PAN', 'No other open booking on the same PAN', 'DUPLICATE', 'FAIL', 'The same PAN is on an open booking at Aditya Hyundai, Tamando raised 6 days earlier.', { leftValue: 'ABXPP4821K', rightValue: 'MAH-OD/BBS/2026/BK-004377' }),
    ctl('BK_BOOKING_FORM_SIGNED', 'Booking form signed by the customer', 'DOCUMENT', 'PASS', 'Customer signature found on page 2.'),
    ctl('BK_GSTIN_VALID', 'Customer GSTIN valid', 'IDENTITY', 'NOT_APPLICABLE', 'Individual customer: no GSTIN.'),
  ],
  DELIVERY: [
    ctl('DL_NDC_VS_INVOICE', 'NDC net payable agrees with the invoices', 'PRICING', 'FAIL', 'The NDC prints road tax ₹2,550 above the RTO challan.', { leftValue: amt(net.current + 2550), rightValue: amt(net.current) }),
    ctl('DL_EXCHANGE_WITHIN_SCHEME', 'Exchange bonus within the scheme', 'DISCOUNT', 'FAIL', 'Exchange bonus given is more than the November scheme allows.', { leftValue: '30000.00', rightValue: '25000.00' }),
    ctl('DL_CORPORATE_PROOF', 'Corporate privilege proof on file', 'DISCOUNT', 'FAIL', 'Employee ID card or salary slip not uploaded.'),
    ctl('DL_RECEIPTS_EQUAL_INVOICE', 'Receipts equal the net payable', 'PAYMENT', 'FAIL', `Balance of ₹${(net.current - PAID).toLocaleString('en-IN')} still due from the customer.`, { leftValue: amt(PAID), rightValue: amt(net.current) }),
    ctl('DL_TCS_APPLIED', 'TCS charged above ₹10 lakh', 'TAX', 'PASS', 'TCS of 1% charged on the invoice.'),
    ctl('DL_LOAN_DO_MATCH', 'Loan disbursed equals the delivery order', 'FINANCE', 'PASS', 'HDFC Bank disbursed the DO amount in full.', { leftValue: '1050000.00', rightValue: '1050000.00' }),
    ctl('DL_RSA_INVOICE', 'RSA invoice on file', 'DOCUMENT', 'WAITING_FOR_FACTS', 'Waiting for the RSA invoice from Mahindra Assist.'),
    ctl('DL_GATE_PASS', 'Gate pass matches the delivered VIN', 'DELIVERY', 'WAITING_FOR_FACTS', 'Gate pass not uploaded yet.'),
    ctl('DL_FORM_21_22', 'Form 21 / 22 on file', 'REGISTRATION', 'PASS', 'Both forms read and signed.'),
    ctl('DL_INSURANCE_START', 'Insurance starts on or before delivery', 'INSURANCE', 'RETRY_PENDING', 'Insurer portal did not respond; retrying.'),
    ctl('DL_SCRAPPAGE_COMBO', 'Scrappage not combined with exchange', 'DISCOUNT', 'NOT_APPLICABLE', 'No scrappage certificate on this deal.'),
  ],
};
const stats = (items) => ({
  total: items.length,
  pass: items.filter((i) => i.status === 'PASS').length,
  fail: items.filter((i) => i.status === 'FAIL').length,
  waiting: items.filter((i) => i.status === 'WAITING_FOR_FACTS').length,
  notApplicable: items.filter((i) => i.status === 'NOT_APPLICABLE').length,
  retry: items.filter((i) => i.status === 'RETRY_PENDING').length,
  error: items.filter((i) => i.status === 'ERROR_TERMINAL').length,
});
const controlStats = { BOOKING: stats(controls.BOOKING), DELIVERY: stats(controls.DELIVERY) };

// ── duplicates, closure ─────────────────────────────────────────────────────
const duplicatePairs = [{
  findingId: 'finding-dup-1', role: 'THIS_IS_DUPLICATE', severity: 'HIGH', status: 'OPEN', raisedAtUtc: at(18, '12:05:00'),
  matchBasis: 'SAME_PAN', matchBasisLabel: 'Same PAN (ABXPP4821K)', matchConfidencePercent: 96, matchConfidenceLabel: 'HIGH',
  originalityBasis: 'EARLIER_BOOKING',
  otherJourney: { journey_id: 'journey-mobile-dup', journey_reference: 'MAH-OD/BBS/2026/BK-004377', customer_name: 'Bibhuti Bhushan Pradhan',
    outlet_name: outlets[0].outletName, vehicle: 'Mahindra XUV 3XO AX5 L Turbo MT Petrol', created_at_utc: at(30, '11:20:00') },
}];

const reviewerClosure = {
  closureId: 'closure-1', closedBy: 'Sasmita Rout', closedRole: 'REVIEWER',
  comment: 'Delivery file reviewed against the NDC and invoices. Exchange bonus over the scheme by ₹5,000 is approved by the GM on the deal sheet; corporate privilege proof promised by the customer by Monday. RSA invoice awaited from Mahindra Assist.',
  itemCount: 3,
  items: [
    { key: 'DOC:GATE_PASS', kind: 'MISSING_DOCUMENT', stage: 'DELIVERY', label: 'Gate pass', requirement: 'MANDATORY',
      answer: 'Vehicle delivered from the Patia yard; the gate register entry is on file and the gate pass is being scanned.', answerSource: 'REVIEWER' },
    { key: 'FINDING:finding-exch', kind: 'OPEN_FINDING', stage: 'DELIVERY', label: 'Exchange bonus more than entitled (₹5,000)', severity: 'HIGH',
      answer: 'GM approval on the deal sheet, page 3.', answerSource: 'REVIEWER' },
    { key: 'TASK:task-rsa', kind: 'OPEN_TASK', stage: 'DELIVERY', label: 'Upload the RSA invoice', assignedRole: 'PC',
      answer: 'Not mandatory for this deal: RSA is bundled with the extended warranty.', answerSource: 'ACCEPTED_CLAIM' },
  ],
  counts: { MISSING_DOCUMENT: 1, OPEN_FINDING: 1, OPEN_TASK: 1 },
  deliveryOutcome: 'DELIVERED', closedAtUtc: at(0, '09:40:00'), journeyId: 'journey-mobile-1',
  acceptanceStatus: 'PENDING', acceptanceDueUtc: at(-4, '09:40:00'), acceptanceTaskId: 'task-accept-1',
  decidedBy: null, decidedRole: null, decidedAtUtc: null,
  rejections: [{ key: 'FINDING:finding-exch', label: 'Exchange bonus more than entitled (₹5,000)', kind: 'OPEN_FINDING',
    reason: 'GM approval is not on page 3 of the deal sheet uploaded; upload the signed approval.' }],
};

// ── Journey 360 summary ─────────────────────────────────────────────────────
const gates = {
  KYC_EXTRACTED: { passed: true, label: 'Customer KYC read', kind: 'DOCUMENT', documentCount: 2 },
  BOOKING_FORM: { passed: true, label: 'Booking form read', kind: 'DOCUMENT', documentCount: 1 },
  MINIMUM_BOOKING_AMOUNT: { passed: true, label: 'Minimum booking amount received', kind: 'PAYMENT',
    receiptTotal: amt(21000), minimumAmount: amt(21000), shortfall: amt(0), receiptCount: 1, pendingCount: 0 },
  MANUAL_VERIFICATION: { passed: false, label: 'Manual verification', kind: 'TASK', action: 'Verify 2 values', pendingCount: 2 },
};
const deliveryGate = {
  passed: false, requiredCount: 11, receivedCount: 8,
  missing: [{ key: 'GATE_PASS', label: 'Gate pass' }, { key: 'RSA_INVOICE', label: 'RSA invoice' }, { key: 'CORPORATE_PROOF', label: 'Employee ID card or salary slip' }],
};
function summary360() {
  return {
    journey: {
      closed: false, reviewerClosure: { status: 'PENDING', closedAtUtc: reviewerClosure.closedAtUtc }, reviewedAtUtc: null,
      journeyId: 'journey-mobile-1', reference: REFERENCE, customerName: CUSTOMER, customerType: 'INDIVIDUAL', mobileLast4: '4417',
      dealerName: OUTLET.dealerName, outletName: OUTLET.outletName, city: 'Bhubaneswar',
      vehicle: VEHICLE, skuCode: SKU, vehicleResolution: 'RESOLVED', vin: 'MA1NE2ZTXR6K40917', vehicleCategory: 'PV',
      registrationNumber: 'OD02CK4417', financier: 'HDFC Bank Ltd, Janpath Branch', insurer: 'ICICI Lombard General Insurance',
      createdAtUtc: at(24, '11:02:00'), deliveredAtUtc: at(1, '17:30:00'),
    },
    stage: {
      stage: 'DELIVERY_VERIFY_DOCUMENTS', bookingCompletionState: 'COMPLETE', minimumBookingAmount: amt(21000),
      bookingReceiptTotal: amt(21000), manualVerificationPending: 2, gates, delivery: deliveryGate,
    },
    money: { ...dealSummary, flagged: deal.flagged, minimumBookingAmount: amt(21000), bookingReceiptTotal: amt(21000) },
    numbers: { documents: 23, vehiclePhotos: 6, openTasks: 5, overdueTasks: 2, openFindings: 4 },
    controls: controlStats,
    sections: ['deal', 'invoices', 'addons', 'payments', 'documents', 'vehicle', 'tradein', 'customer', 'registration', 'compliance', 'audit-summary', 'audit'],
  };
}

// ── payments ────────────────────────────────────────────────────────────────
const bankMatch = (status, extra = {}) => ({ status, method: null, documentId: null, date: null, reference: null, recorded: true, ...extra });
const payments = {
  items: [
    { paymentId: 'pay-1', amount: amt(21000), receiptNumber: 'RCPT/BBS/26-27/04412', receiptDate: dayOffset(24), mode: 'UPI', stage: null,
      bank: 'State Bank of India', reference: 'UPI 432918774102', documentId: 'doc-rcpt-1', document: 'Booking receipt', counted: true,
      bankStatement: bankMatch('MATCHED', { method: 'UTR', documentId: 'doc-bank-1', date: dayOffset(24), reference: '432918774102' }) },
    { paymentId: 'pay-2', amount: amt(250000), receiptNumber: 'RCPT/BBS/26-27/04588', receiptDate: dayOffset(12), mode: 'CHEQUE', stage: null,
      bank: 'Punjab National Bank', reference: 'Chq 004417', documentId: 'doc-rcpt-2', document: 'Receipt', counted: true,
      bankStatement: bankMatch('MATCHED', { method: 'REFERENCE', documentId: 'doc-bank-1', date: dayOffset(10), reference: 'CLG 004417' }) },
    { paymentId: 'pay-3', amount: amt(250000), receiptNumber: 'RCPT/BBS/26-27/04588', receiptDate: dayOffset(12), mode: 'CHEQUE', stage: null,
      bank: 'Punjab National Bank', reference: 'Chq 004417', documentId: 'doc-rcpt-3', document: 'Receipt (second copy)', counted: false,
      duplicateOf: 'pay-2', notCountedReason: 'Same receipt number, amount and date as RCPT/BBS/26-27/04588 uploaded earlier',
      bankStatement: bankMatch('MATCHED', { method: 'REFERENCE', documentId: 'doc-bank-1', date: dayOffset(10), reference: 'CLG 004417' }) },
    { paymentId: 'pay-4', amount: amt(LOAN), receiptNumber: 'RCPT/BBS/26-27/04913', receiptDate: dayOffset(3), mode: 'NEFT', stage: null,
      bank: 'HDFC Bank', reference: 'HDFCN52026110412883', documentId: 'doc-rcpt-4', document: 'Loan receipt', counted: true, isLoanReceipt: true,
      bankStatement: bankMatch('MATCHED', { method: 'UTR', documentId: 'doc-bank-1', date: dayOffset(3), reference: 'HDFCN52026110412883' }) },
    { paymentId: 'pay-5', amount: amt(85000), receiptNumber: 'RCPT/BBS/26-27/05021', receiptDate: dayOffset(2), mode: 'CASH', stage: null,
      documentId: 'doc-rcpt-5', document: 'Receipt', counted: true, bankStatement: bankMatch('NOT_APPLICABLE') },
    { paymentId: 'pay-6', amount: amt(100000), receiptNumber: 'RCPT/BBS/26-27/05077', receiptDate: dayOffset(1), mode: 'RTGS', stage: null,
      bank: 'Axis Bank', reference: 'UTIBR52026110600317', documentId: 'doc-rcpt-6', document: 'Receipt', counted: true,
      bankStatement: bankMatch('UNMATCHED') },
    { paymentId: 'pay-7', amount: null, receiptNumber: null, receiptDate: dayOffset(1), mode: null, stage: null,
      documentId: 'doc-rcpt-7', document: 'Receipt (photo)', counted: false, notCountedReason: 'Amount not read from the receipt',
      bankStatement: null },
  ],
  figuresNotRead: [{ documentId: 'doc-rcpt-7', documentType: 'payment_receipt', document: 'Receipt (photo)', pageNumber: 1, missing: ['Amount', 'Receipt number', 'Mode'] }],
  receiptsTotal: amt(RECEIPTS), loanDisbursed: amt(LOAN), loanReceiptsTotal: amt(LOAN), paidTotal: amt(PAID),
  byStage: {},
  loanSource: 'HDFC Bank disbursement receipt', loanUnknown: false, oldVehicle: amt(OLD_VEHICLE), refunds: null,
  loanWithoutReceipt: null, duplicates: 1,
  bankStatement: {
    lines: [
      { documentId: 'doc-bank-1', bank: 'Axis Bank', accountHolder: OUTLET.dealerName, accountNumber: 'XXXXXXXX2291', date: dayOffset(24),
        description: 'UPI/432918774102/BIBHUTIBHUSHAN P/SBIN', reference: '432918774102', counterparty: 'BIBHUTIBHUSHAN PRADHAN',
        credit: amt(21000), debit: null, balance: amt(4812290.55), matchedPaymentId: 'pay-1', matchedReceipt: 'RCPT/BBS/26-27/04412', matchMethod: 'UTR' },
      { documentId: 'doc-bank-2', bank: 'Axis Bank', accountHolder: OUTLET.dealerName, accountNumber: 'XXXXXXXX2291', date: dayOffset(10),
        description: 'CLG/004417/PUNB0BBSR01/B PRADHAN', reference: 'CLG 004417', counterparty: 'B PRADHAN',
        credit: amt(250000), debit: null, balance: amt(6120455.1), matchedPaymentId: 'pay-2', matchedReceipt: 'RCPT/BBS/26-27/04588', matchMethod: 'REFERENCE' },
      { documentId: 'doc-bank-3', bank: 'Axis Bank', accountHolder: OUTLET.dealerName, accountNumber: 'XXXXXXXX2291', date: dayOffset(3),
        description: 'NEFT/HDFCN52026110412883/HDFC BANK LTD RETAIL ASSETS', reference: 'HDFCN52026110412883', counterparty: 'HDFC BANK LTD',
        credit: amt(LOAN), debit: null, balance: amt(8019331.4), matchedPaymentId: 'pay-4', matchedReceipt: 'RCPT/BBS/26-27/04913', matchMethod: 'UTR' },
      { documentId: 'doc-bank-4', bank: 'Axis Bank', accountHolder: OUTLET.dealerName, accountNumber: 'XXXXXXXX2291', date: dayOffset(1),
        description: 'RTGS/UTIBR52026110600219/PRADHAN ENTERPRISES', reference: 'UTIBR52026110600219', counterparty: 'PRADHAN ENTERPRISES',
        credit: amt(98500), debit: null, balance: amt(8117831.4), matchedPaymentId: null, matchedReceipt: null, matchMethod: null },
      { documentId: 'doc-bank-5', bank: 'Axis Bank', accountHolder: OUTLET.dealerName, accountNumber: 'XXXXXXXX2291', date: dayOffset(1),
        description: 'CHG/RTGS INWARD', reference: null, counterparty: null,
        credit: null, debit: amt(29.5), balance: amt(8117801.9), matchedPaymentId: null, matchedReceipt: null, matchMethod: null },
    ],
    creditsTotal: amt(21000 + 250000 + LOAN + 98500), matchedTotal: amt(21000 + 250000 + LOAN),
    matched: 3, unmatchedCredits: 1, receiptsWithoutCredit: 1,
  },
};

// ── vehicle, add-ons ────────────────────────────────────────────────────────
const taken = {
  accessories: {
    taken: true, amount: amt(24500), amountSource: 'billed', provider: 'Mahindra Genuine Accessories',
    items: [
      { name: '3D floor mats (Dual Tone)', amount: amt(6200), quantity: 1, itemCode: '0401CAB00121N', documentId: 'doc-inv-acc' },
      { name: 'Body side moulding chrome', amount: amt(4850), quantity: 1, itemCode: '0401CAD00219N', documentId: 'doc-inv-acc' },
      { name: 'Mud flaps set of 4', amount: amt(1450), quantity: 1, itemCode: '0401CAA00512N', documentId: 'doc-inv-acc' },
      { name: 'Dash cam with rear camera (Mahindra Smart)', amount: amt(8950), quantity: 1, itemCode: '0401EAZ00977N', documentId: 'doc-inv-acc' },
      { name: 'Car cover (Nebula Blue)', amount: amt(3050), quantity: 1, itemCode: '0401CAC00330N', documentId: 'doc-inv-acc' },
    ],
    details: { invoiceNumbers: ['ACC/BBS/26-27/2291'] }, documentIds: ['doc-inv-acc'],
  },
  insurance: {
    taken: true, amount: amt(58920), amountSource: 'billed', provider: 'ICICI Lombard General Insurance',
    items: [
      { name: 'Own damage (1 yr)', amount: amt(31480.32), documentId: 'doc-policy' },
      { name: 'Third party (3 yrs)', amount: amt(11416), documentId: 'doc-policy' },
      { name: 'Zero depreciation, engine protect, RTI, consumables', amount: amt(16023.68), documentId: 'doc-policy' },
    ],
    details: {
      insurerName: 'ICICI Lombard General Insurance', policyNumber: '3001/MOT/298814721/00/000', policyType: 'Bundled (1 OD + 3 TP)',
      coverNoteReference: 'CN-ICL-OD-77812', insuranceBy: 'Dealer (Inhouse)', policyStartDate: dayOffset(1), policyEndDate: dayOffset(-364),
      issueDate: dayOffset(2), idvAmount: '1414550', standardPremium: '62450', actualPremium: '58920', agentName: 'Aditya Insurance Desk',
      agentCode: 'IMD-0042-OD', mispCode: 'MISP-OD-0042', addOns: ['Zero depreciation', 'Engine protect', 'Return to invoice', 'Consumables', 'Key replacement'],
    },
    documentIds: ['doc-policy'],
  },
  warranty: {
    taken: true, amount: amt(18999), amountSource: 'billed', provider: 'Mahindra & Mahindra Ltd',
    items: [{ name: 'Shield Gold 4th & 5th year', amount: amt(18999), quantity: 1, itemCode: 'EW-SG-3XO-D', documentId: 'doc-inv-ew' }],
    details: { planName: 'Shield Gold (5 yrs / 1,50,000 km)', providerName: 'Mahindra & Mahindra Ltd', invoiceNumber: 'EW/MW/26/0918812',
      invoiceDate: dayOffset(2), coverageStartDate: dayOffset(-1095), coverageEndDate: dayOffset(-1825), tenureMonths: 24 },
    documentIds: ['doc-inv-ew'],
  },
};
const vehicle = {
  product: { model: 'XUV 3XO', variant: 'AX7 L Turbo AT Diesel', colour: 'Nebula Blue with Stealth Black roof (Dual Tone)', sku_code: SKU,
    vehicle_category: 'PV', selection_status: 'RESOLVED' },
  units: [{ vin: 'MA1NE2ZTXR6K40917', chassis_number: 'MA1NE2ZTXR6K40917', dms_reference: 'DMS-ALLOC-26-118871',
    invoice_reference: 'INV/BBS/26-27/011873', allocated_at_utc: at(9, '15:20:00') }],
  photoCount: 6,
  addons: taken,
  booking: { bookingReference: REFERENCE, bookingDate: BOOKING_DATE, salesConsultant: 'Subhashree Mohapatra', dealerBranch: OUTLET.outletName,
    dealType: 'RETAIL', dealSource: 'WALK_IN', leadSource: 'Showroom walk-in (referral by existing customer)', expectedDelivery: dayOffset(2) },
  delivery: { actual_delivery_status_code: 'DELIVERED', planned_delivery_at: dayOffset(2), delivery_intimated_at: dayOffset(3), actual_delivered_at: dayOffset(1) },
  journey: { startedAtUtc: at(24, '11:02:00'), registrationNumber: 'OD02CK4417', financier: 'HDFC Bank Ltd, Janpath Branch', insurer: 'ICICI Lombard General Insurance' },
};
const photoSvg = (label, color) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${color}"/><text x="160" y="128" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${label}</text></svg>`)}`;
const photos = {
  photos: [['FRONT', '#1f4e79'], ['REAR', '#2e6b4f'], ['LEFT', '#6b4f2e'], ['RIGHT', '#4f2e6b'], ['ODOMETER', '#333'], ['CHASSIS', '#7a2e2e']]
    .map(([view, color], i) => ({ photoId: `photo-${i + 1}`, filename: `${view.toLowerCase()}.jpg`, contentType: 'image/jpeg', sizeBytes: 812_000 + i * 9_000,
      viewCode: view, uploadedByActorId: 'actor-pc-1', uploadedAtUtc: at(1, `17:${String(10 + i).padStart(2, '0')}:00`), url: photoSvg(view, color) })),
  limit: 12, maxBytes: 8_388_608, views: ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'INTERIOR', 'ODOMETER', 'CHASSIS', 'DELIVERY'], pdfLimit: 3, maxPdfBytes: 15_728_640,
};

const addons = {
  taken,
  insurance: {
    records: [{ insurer_name: 'ICICI Lombard General Insurance', policy_reference: '3001/MOT/298814721/00/000', cover_note_reference: 'CN-ICL-OD-77812',
      insurance_by: 'DEALER', agent_intermediary_name: 'Aditya Insurance Desk', agent_intermediary_code: 'IMD-0042-OD', misp_code: 'MISP-OD-0042',
      standard_premium_amount: '62450.00', actual_premium_amount: '58920.00', premium_variance: '-3530.00',
      add_ons: ['Zero depreciation', 'Engine protect', 'Return to invoice', 'Consumables'], actual_status_code: 'ISSUED' }],
    charges: categories[2], discount: null, figuresNotRead: [],
  },
  accessories: { records: [{ addon_type_code: 'ACCESSORY', provider_name: 'Mahindra Genuine Accessories', actual_amount: '24500.00', free_amount: '6050.00' }],
    charges: categories[3], discount: null },
  protection: {
    records: [
      { label: 'Extended warranty · Shield Gold', provider_name: 'Mahindra & Mahindra Ltd', actual_amount: '18999.00', variance: null },
      { label: 'Road side assistance (3 years)', provider_name: 'Mahindra Assist', actual_amount: null, variance: null },
    ],
    charges: categories[4], discounts: [],
  },
  finance: { records: [{ finance_type_code: 'LOAN', provider_name: 'HDFC Bank Ltd, Janpath Branch', hypothecation_charges: '1500.00',
    sanctioned_amount: '1100000.00', loan_disbursement_amount: '1050000.00', loan_disbursement_confidence: 'HIGH',
    loan_disbursement_match_basis: 'UTR on the bank statement', do_reference: 'HDFC/DO/BBS/26/558812', disbursement_date: dayOffset(3),
    disbursement_reference: 'HDFCN52026110412883', disbursement_gap: '50000.00', actual_status_code: 'DISBURSED' }] },
  exchange: { records: [{ old_vehicle_make_model: 'Maruti Suzuki Ciaz ZXi 2017', old_vehicle_registration: 'OD02AB7781', quoted_value: '185000.00',
    actual_value: '195000.00', actual_status_code: 'HANDED_OVER' }], discount: discounts[1] },
  scrappage: { discounts: [] },
};

// ── customer ────────────────────────────────────────────────────────────────
const customer = {
  identityStatus: 'DOCUMENT_VERIFIED',
  kycDocuments: ['PAN Card', 'Aadhaar (masked)'],
  fields: [
    { key: 'enteredName', label: 'Name on the booking', value: 'Bibhuti Bhushan Pradhan', source: 'Booking docket' },
    { key: 'legalName', label: 'Legal name (KYC)', value: 'BIBHUTIBHUSHAN PRADHAN', source: 'PAN Card' },
    { key: 'identityStatus', label: 'Identity', value: 'DOCUMENT_VERIFIED', source: null },
    { key: 'customerType', label: 'Customer type', value: 'INDIVIDUAL', source: 'Booking docket' },
    { key: 'pan', label: 'PAN', value: 'ABXPP4821K', source: 'PAN Card' },
    { key: 'aadhaar', label: 'Aadhaar', value: 'XXXX XXXX 7718', source: 'Aadhaar (masked)' },
    { key: 'fatherName', label: "Father's name", value: 'Late Gopinath Pradhan', source: 'PAN Card' },
    { key: 'dateOfBirth', label: 'Date of birth', value: '1978-03-14', source: 'PAN Card' },
    { key: 'mobile', label: 'Mobile', value: '+91 98XXXX4417', source: 'Booking docket' },
    { key: 'email', label: 'Email', value: 'bibhutibhushan.pradhan1978@rediffmail.com', source: 'Booking docket' },
    { key: 'gstin', label: 'GSTIN', value: null, source: null },
    { key: 'address', label: 'Address', value: 'Plot No. 1187/2219, Lane 4, Sundarpada, Near Maa Bhagabati Temple, Bhubaneswar, Khordha, Odisha 751002', source: 'Aadhaar (masked)' },
  ],
};

// ── audit summary ───────────────────────────────────────────────────────────
const arow = (section, key, label, entitled, booked, billed, conclusion, extra = {}) => ({
  section, key, label, entitled: amt(entitled), booked: amt(booked), billed: amt(billed), billedFrom: billed !== null ? 'NDC' : null,
  proof: null, difference: entitled !== null && billed !== null && billed !== entitled ? amt(billed - entitled) : null,
  conclusion, impact: null, reason: null, rule: null, documents: [], ...extra,
});
const auditSummary = {
  generatedAtUtc: at(0, '09:12:00'), tolerance: '10', billedSource: 'ACCOUNT_STATEMENT',
  rules: {
    'AS-01': 'A charge is OK when billed within the tolerance of its standard figure.',
    'AS-02': 'Road tax and registration are checked against the RTO challan, not the price master.',
    'AS-03': 'Insurance is checked against the policy premium.',
    'AS-04': 'A benefit is OK when given within its entitlement and its proof is on file.',
    'AS-06': 'A product is sold when a document proves it; its charge is checked against standard.',
    'AS-08': 'Each non-cash receipt must appear as a credit on the dealership bank statement.',
    'AS-09': 'The loan disbursed must equal the delivery order.',
    'AS-10': 'The deal balance must agree with the Tally customer ledger.',
    'AS-11': 'NDC and cost-sheet totals must equal the sum of their rows.',
  },
  verdict: {
    status: 'EXCEPTIONS',
    counts: { OK: 9, EXCEPTION: 3, UNSUPPORTED: 1, DISPUTED: 1, CANNOT_DETERMINE: 2 },
    amountAtRisk: { customerOvercharged: amt(2550), companyLeakage: amt(7500) },
    missing: ['RSA invoice (Mahindra Assist)', 'Employee ID card or salary slip for corporate privilege', 'Gate pass'],
  },
  deal: {
    charges: [
      arow('deal', 'EX_SHOWROOM', 'Ex-showroom price', 1489000, 1489000, 1489000, 'OK', { category: 'Vehicle', rule: 'AS-01' }),
      arow('deal', 'TCS', 'TCS @ 1%', 14890, 14890, 14890, 'OK', { category: 'Tax', rule: 'AS-01' }),
      arow('deal', 'ROAD_TAX_REGISTRATION', 'Road tax + registration', 178680, 178680, 181230, 'EXCEPTION', {
        category: 'Registration', impact: 'CUSTOMER', rule: 'AS-02', reason: 'NDC charges ₹2,550 more than the RTO challan collects.',
        proof: { documents: ['RTO challan OD02-26-118812'], onFile: true, amount: amt(178680) },
        documents: [{ document: 'NDC', amount: amt(181230) }, { document: 'RTO challan', amount: amt(178680) }] }),
      arow('deal', 'INSURANCE_PREMIUM', 'Insurance premium', 62450, 60000, 58920, 'OK', {
        category: 'Insurance', rule: 'AS-03', reason: 'Billed as the policy premium.', proof: { documents: ['Policy 3001/MOT/298814721'], onFile: true, amount: amt(58920) } }),
      arow('deal', 'FASTAG', 'FASTag', 500, 500, 500, 'OK', { category: 'Other', rule: 'AS-01' }),
    ],
    gross: amt(gross.billed), discounts: amt(disc.current), netPayable: amt(net.current),
  },
  benefits: [
    arow('benefits', 'CONSUMER_OFFER', 'Consumer offer', 40000, 40000, 40000, 'OK', { rule: 'AS-04', eligibility: 'ELIGIBLE' }),
    arow('benefits', 'EXCHANGE_BONUS', 'Exchange bonus', 25000, 25000, 30000, 'EXCEPTION', {
      impact: 'COMPANY', rule: 'AS-04', reason: '₹5,000 more than the November exchange scheme allows.',
      proof: { documents: ['Old vehicle RC', 'Valuation report'], onFile: true } }),
    arow('benefits', 'CORPORATE_PRIVILEGE', 'Corporate privilege', 5000, 5000, 7500, 'UNSUPPORTED', {
      impact: 'COMPANY', rule: 'AS-04', reason: 'Proof of employment not on file, and ₹2,500 over the policy.',
      proof: { documents: ['Employee ID card or salary slip'], onFile: false } }),
    arow('benefits', 'DEALER_CASH', 'Dealer cash discount', null, 10000, 15000, 'DISPUTED', {
      rule: 'AS-04', reason: 'Only the Tally invoice prints it; the NDC does not.', billedFrom: 'Tax invoice (Tally)',
      documents: [{ document: 'Booking docket', amount: amt(10000) }, { document: 'Tax invoice (Tally)', amount: amt(15000) }] }),
  ],
  products: [
    arow('products', 'ACCESSORIES', 'Accessories', 25000, 25000, 18450, 'OK', { taken: true, rule: 'AS-06',
      reason: '₹6,050 of the ₹24,500 accessory invoice given free.', proof: { documents: ['Accessory invoice ACC/BBS/26-27/2291'], onFile: true, amount: amt(24500) } }),
    arow('products', 'EXTENDED_WARRANTY', 'Extended warranty', 18999, 18999, 18999, 'OK', { taken: true, rule: 'AS-06',
      proof: { documents: ['EW invoice EW/MW/26/0918812'], onFile: true, amount: amt(18999) } }),
    arow('products', 'RSA', 'Road side assistance', 2999, 2999, null, 'CANNOT_DETERMINE', { taken: true, rule: 'AS-06',
      reason: 'RSA invoice not on file.', proof: { documents: ['RSA invoice'], onFile: false } }),
    arow('products', 'INSURANCE', 'Insurance', 62450, 60000, 58920, 'OK', { taken: true, rule: 'AS-03',
      proof: { documents: ['Policy 3001/MOT/298814721'], onFile: true, amount: amt(58920) } }),
  ],
  funding: {
    receipts: amt(RECEIPTS), loanDisbursed: amt(LOAN), loanSource: 'HDFC Bank disbursement receipt', loanNote: null, loanWithoutReceipt: false,
    refunds: null, refundsSource: null, oldVehicle: amt(OLD_VEHICLE), received: amt(PAID),
    bankCheck: { conclusion: 'EXCEPTION', rule: 'AS-08', reason: 'RTGS receipt RCPT/BBS/26-27/05077 (₹1,00,000) has no matching credit.',
      verified: amt(21000 + 250000 + LOAN), cash: amt(85000), notFound: amt(100000), noStatement: amt(0) },
    loans: [{ conclusion: 'OK', rule: 'AS-09', reason: 'Disbursed equals the delivery order.', lender: 'HDFC Bank Ltd, Janpath Branch',
      sanctioned: amt(1100000), disbursed: amt(LOAN), deliveryOrder: 'HDFC/DO/BBS/26/558812', difference: null }],
    bankApprovalOnFile: true, deliveryOrderOnFile: true,
    exchange: { applicable: true, bookedValue: amt(180000), quotedValue: amt(185000), actualValue: amt(OLD_VEHICLE), valuationReports: 2 },
    scrappage: { certificates: 0 },
    creditNotes: { count: 2, total: amt(35000), items: deal.creditNotes },
    insurance: { by: 'Dealer (Inhouse)', decidedBy: 'DOCUMENT', basis: 'Dealer MISP code MISP-OD-0042 on the policy' },
    customerLedger: { conclusion: 'DISPUTED', rule: 'AS-10', reason: 'Ledger shows ₹2,550 less due than the deal.',
      ledgerBalance: amt(net.current - PAID - 2550), dealBalance: amt(net.current - PAID), difference: amt(2550), documentId: 'doc-ledger' },
  },
  settlement: { conclusion: 'EXCEPTION', rule: 'AS-10', reason: 'Received is short of the net payable.', payable: amt(net.current), received: amt(PAID),
    balance: amt(net.current - PAID), status: 'SHORT' },
  disputed: [
    { label: 'Road tax + registration', documents: [{ document: 'NDC', amount: amt(181230) }, { document: 'RTO challan', amount: amt(178680) }] },
    { label: 'Dealer cash discount', documents: [{ document: 'Booking docket', amount: amt(10000) }, { document: 'Tax invoice (Tally)', amount: amt(15000) }] },
  ],
  requiredDocuments: [
    { key: 'GATE_PASS', label: 'Gate pass', stage: 'DELIVERY', requirement: 'MANDATORY', reason: null, onFile: false, count: 0 },
    { key: 'RSA_INVOICE', label: 'RSA invoice', stage: 'DELIVERY', requirement: 'CONDITIONAL', reason: 'RSA is charged on the NDC', onFile: false, count: 0 },
    { key: 'CORPORATE_PROOF', label: 'Employee ID card or salary slip', stage: 'DELIVERY', requirement: 'CONDITIONAL', reason: 'Corporate privilege is given', onFile: false, count: 0 },
    { key: 'PAN', label: 'PAN Card', stage: 'BOOKING', requirement: 'MANDATORY', reason: null, onFile: true, count: 1 },
    { key: 'AADHAAR', label: 'Aadhaar', stage: 'BOOKING', requirement: 'MANDATORY', reason: null, onFile: true, count: 2 },
    { key: 'BOOKING_FORM', label: 'Booking docket', stage: 'BOOKING', requirement: 'MANDATORY', reason: null, onFile: true, count: 1 },
    { key: 'NDC', label: 'NDC (account statement)', stage: 'DELIVERY', requirement: 'MANDATORY', reason: null, onFile: true, count: 1 },
    { key: 'CUSTOMER_INVOICE', label: 'Customer invoice', stage: 'DELIVERY', requirement: 'MANDATORY', reason: null, onFile: true, count: 2 },
    { key: 'BANK_APPROVAL', label: 'Bank approval letter', stage: 'DELIVERY', requirement: 'CONDITIONAL', reason: 'The deal is financed', onFile: true, count: 1 },
    { key: 'RC_OLD_VEHICLE', label: 'Old vehicle RC', stage: 'DELIVERY', requirement: 'CONDITIONAL', reason: 'Exchange bonus is given', onFile: true, count: 1 },
  ],
  statementTotals: [{ conclusion: 'EXCEPTION', rule: 'AS-11', reason: 'The NDC total is ₹1,000 more than its rows.', label: 'NDC total (on-road price)',
    documentId: 'doc-ndc', document: 'NDC (account statement)', pageNumber: 1, total: 'ON_ROAD', printed: amt(net.current + 3550),
    rows: amt(net.current + 2550), difference: amt(1000), impact: 'CUSTOMER', dealerArithmetic: false }],
};

// ── other tabs ──────────────────────────────────────────────────────────────
const field = (key, label, value, extra = {}) => ({ key, label, value, machineValue: value, corrected: false, confidence: 97.4,
  reviewed: true, needsReview: false, keyField: false, ...extra });
const documents360 = {
  documents: [
    { documentId: 'doc-ndc', evidenceId: 'ev-ndc', documentType: 'account_statement', templateKey: 'account_statement', label: 'NDC (account statement)',
      stage: 'DELIVERY', pages: [1, 2], linkedAtUtc: at(2, '12:00:00'), fieldCount: 24, needsReview: 2, corrected: 1,
      fields: [
        field('customer_name', 'Customer name', 'BIBHUTIBHUSHAN PRADHAN', { keyField: true }),
        field('ex_showroom_amount', 'Ex-showroom', '1489000.00', { keyField: true }),
        field('road_tax_amount', 'Road tax + registration', '181230.00', { needsReview: true, reviewed: false, confidence: 71.2 }),
        field('exchange_bonus_amount', 'Exchange bonus', '30000.00', { corrected: true, machineValue: '3000.00' }),
        field('net_payable_amount', 'Net payable', amt(net.current + 3550), { keyField: true, needsReview: true, reviewed: false, confidence: 64.9 }),
      ] },
    { documentId: 'doc-inv-vehicle', evidenceId: 'ev-inv', documentType: 'customer_invoice_dms', templateKey: 'customer_invoice_dms', label: 'Customer invoice (DMS)',
      stage: 'DELIVERY', pages: [3], linkedAtUtc: at(3, '15:00:00'), fieldCount: 31, needsReview: 0, corrected: 0,
      fields: [field('invoice_number', 'Invoice no.', 'INV/BBS/26-27/011873', { keyField: true }), field('vin_number', 'VIN', 'MA1NE2ZTXR6K40917', { keyField: true })] },
    { documentId: 'doc-pan', evidenceId: 'ev-pan', documentType: 'pan_card', templateKey: 'pan_card', label: 'PAN Card', stage: 'BOOKING', pages: [1],
      linkedAtUtc: at(24, '11:10:00'), fieldCount: 4, needsReview: 0, corrected: 0,
      fields: [field('pan_number', 'PAN', 'ABXPP4821K', { keyField: true }), field('name', 'Name', 'BIBHUTIBHUSHAN PRADHAN')] },
  ],
};
const line2 = (description, category, itemCode, hsnSac, gross, discountAmount, taxRate) => {
  const taxable = gross - (discountAmount ?? 0);
  const tax = Math.round(taxable * taxRate) / 100;
  return { description, category, itemCode, hsnSac, quantity: 1, unitRate: amt(gross), grossAmount: amt(gross), discountAmount: amt(discountAmount),
    taxableAmount: amt(taxable), taxRate, taxAmount: amt(tax), netAmount: amt(taxable + tax) };
};
const invoices = {
  count: 3,
  documents: [
    { documentId: 'doc-inv-vehicle', documentType: 'customer_invoice_dms', label: 'Customer invoice (DMS)', linkedAtUtc: at(3, '15:00:00'),
      header: { invoiceNumber: 'INV/BBS/26-27/011873', invoiceDate: INVOICE_DATE, invoiceNature: 'RETAIL', sourceSystem: 'DMS',
        sellerName: OUTLET.dealerName, sellerGstin: '21AAKCA4417R1ZQ', buyerName: 'BIBHUTIBHUSHAN PRADHAN', financedBy: 'HDFC Bank Ltd',
        modelNameRaw: 'XUV 3XO', variantRaw: 'AX7 L TURBO AT DSL DT', vinNumber: 'MA1NE2ZTXR6K40917', chassisNumber: 'MA1NE2ZTXR6K40917', engineNumber: 'U2D4T60918812' },
      totals: { grossAmountBeforeDiscount: amt(1170000), invoiceDiscountAmount: amt(40000), taxableAmount: amt(1130000), cgstAmount: amt(158200),
        sgstAmount: amt(158200), cessAmount: amt(42600), tcsAmount: amt(14890), roundOffAmount: amt(0), grandTotalAmount: amt(1503890) },
      lineItems: [line2('XUV 3XO AX7 L Turbo AT Diesel Dual Tone (Nebula Blue)', 'VEHICLE', 'XUV3XO-AX7L-TDAT', '87032291', 1170000, 40000, 28),
        line2('FASTag', 'OTHER', 'FT-01', '998599', 500, null, 0)] },
    { documentId: 'doc-inv-acc', documentType: 'accessory_invoice_dms', label: 'Accessory invoice', linkedAtUtc: at(3, '15:02:00'),
      header: { invoiceNumber: 'ACC/BBS/26-27/2291', invoiceDate: INVOICE_DATE, sellerName: OUTLET.dealerName, buyerName: 'BIBHUTIBHUSHAN PRADHAN' },
      totals: { taxableAmount: amt(20763), cgstAmount: amt(1868.5), sgstAmount: amt(1868.5), grandTotalAmount: amt(24500) },
      lineItems: taken.accessories.items.map((i) => line2(i.name, 'ACCESSORY', i.itemCode, '87089900', Number(i.amount) / 1.18, null, 18)) },
    { documentId: 'doc-inv-ew', documentType: 'ew_invoice', label: 'Extended warranty invoice', linkedAtUtc: at(2, '10:00:00'),
      header: { invoiceNumber: 'EW/MW/26/0918812', invoiceDate: dayOffset(2), planName: 'Shield Gold', coverageStartDate: dayOffset(-1095),
        coverageEndDate: dayOffset(-1825), tenureMonths: 24 },
      totals: { taxableAmount: amt(16101), cgstAmount: amt(1449), sgstAmount: amt(1449), grandTotalAmount: amt(18999) },
      lineItems: [line2('Shield Gold 4th & 5th year', 'WARRANTY', 'EW-SG-3XO-D', '998714', 16101, null, 18)] },
  ],
};
const tradein = {
  exchange: { applicable: true, value: amt(OLD_VEHICLE) },
  tradeIn: { actual_status_code: 'HANDED_OVER', old_vehicle_make_model: 'Maruti Suzuki Ciaz ZXi 2017', old_vehicle_registration: 'OD02AB7781',
    quoted_value: '185000.00', actual_value: '195000.00', handover_at_utc: at(1, '16:00:00'), payment_at_utc: null },
  certificates: [],
  valuations: [{ documentId: 'doc-val-1', reportNumber: 'TV/BBS/26/3381', valuationDate: dayOffset(9), evaluatorName: 'Mahindra First Choice, Bhubaneswar',
    registrationNumber: 'OD02AB7781', make: 'Maruti Suzuki', model: 'Ciaz', variant: 'ZXi', fuelType: 'Petrol', manufactureMonthYear: '2017-08',
    odometerKm: 84211, numberOfOwners: 1, overallGrade: 'B+', baseMarketValue: '210000.00', finalOfferValue: '195000.00', loanOutstandingOnVehicle: '0' }],
};
const registration = {
  records: [{ rto_office: 'RTO Bhubaneswar (OD-02)', registration_number: 'OD02CK4417', challan_reference: 'OD02-26-118812', challan_date: dayOffset(2),
    road_tax_amount: '175680.00', registration_fee_amount: '3000.00', hypothecation: 'HDFC Bank Ltd', actual_status_code: 'REGISTERED' }],
  charges: categories[1],
};
const auditTrail = {
  pc: 'Subhashree Mohapatra',
  milestones: [
    { key: 'STARTED', label: 'Journey started', atUtc: at(24, '11:02:00'), who: 'Subhashree Mohapatra (PC)', hoursSincePrevious: null },
    { key: 'BOOKING_COMPLETE', label: 'Booking complete', atUtc: at(23, '16:40:00'), who: 'Audit Core', hoursSincePrevious: 29.6 },
    { key: 'DELIVERY_STARTED', label: 'Delivery documents started', atUtc: at(3, '15:00:00'), who: 'Subhashree Mohapatra (PC)', hoursSincePrevious: 478.3 },
    { key: 'CLOSED_BY_REVIEWER', label: 'Closed by the Reviewer', atUtc: at(0, '09:40:00'), who: 'Sasmita Rout (Reviewer)', hoursSincePrevious: 66.7 },
  ],
  pending: [{ key: 'DELIVERY_COMPLETE', label: 'Delivery complete' }, { key: 'TL_ACCEPTED', label: 'Team Lead accepts the closure' }],
  tasks: {
    summary: { opened: 9, closed: 4, open: 5, avgHoursToClose: 13.4 },
    items: [
      { taskId: 'task-1', title: 'Verify road tax on the NDC', category: 'MANUAL_VERIFICATION', taskType: 'VERIFY_FIELD', role: 'PC', raisedBy: 'Audit Core',
        severity: 'HIGH', status: 'READY', openedAtUtc: at(2, '12:05:00'), closedAtUtc: null, hoursOpen: null },
      { taskId: 'task-2', title: 'Upload the RSA invoice', category: 'MISSING_DOCUMENT', taskType: 'UPLOAD_DOCUMENT', role: 'PC', raisedBy: 'Audit Core',
        severity: 'MEDIUM', status: 'IN_PROGRESS', openedAtUtc: at(2, '12:06:00'), closedAtUtc: null, hoursOpen: null },
      { taskId: 'task-3', title: 'Re-upload the receipt photo', category: 'IMAGE_QUALITY', taskType: 'UPLOAD_DOCUMENT', role: 'PC', raisedBy: 'Audit Core',
        severity: 'MEDIUM', status: 'VERIFIED_COMPLETE', openedAtUtc: at(1, '18:00:00'), closedAtUtc: at(1, '20:30:00'), hoursOpen: 2.5 },
    ],
  },
  events: [
    { atUtc: at(0, '09:40:00'), kind: 'review', type: 'REVIEWER_CLOSED', subject: null, who: 'Sasmita Rout', details: { comment: 'Closed with 3 answers.' } },
    { atUtc: at(0, '06:12:00'), kind: 'check', type: 'CONTROL_CHANGED', subject: 'DL_EXCHANGE_WITHIN_SCHEME', who: 'Audit Core', details: { to: 'FAIL' } },
    { atUtc: at(2, '12:00:00'), kind: 'document', type: 'DOCUMENT_READY', subject: null, who: 'Document Intelligence', details: { documentType: 'account_statement', filename: 'NDC_Pradhan_signed.pdf' } },
    { atUtc: at(3, '15:00:00'), kind: 'stage', type: 'STAGE_CHANGED', subject: 'DELIVERY_DOCUMENT_UPLOAD', who: 'Audit Core', details: { to: 'DELIVERY_DOCUMENT_UPLOAD' } },
    { atUtc: at(24, '11:02:00'), kind: 'journey', type: 'JOURNEY_CREATED', subject: null, who: 'Subhashree Mohapatra', details: null },
  ],
};
const uploads = {
  journeyId: 'journey-mobile-1',
  files: [
    { batchId: 'batch-1', filename: 'NDC_Bibhutibhushan_Pradhan_signed_scan_06Nov.pdf', contentType: 'application/pdf', sizeBytes: 3_811_204, pages: 2,
      status: 'COMPLETED', uploadedAtUtc: at(2, '11:58:00'), uploadedBy: 'Subhashree Mohapatra', replacesDocument: false },
    { batchId: 'batch-2', filename: 'delivery_file_all_documents.pdf', contentType: 'application/pdf', sizeBytes: 14_200_811, pages: 19,
      status: 'PARTIAL_FAILURE', uploadedAtUtc: at(3, '14:51:00'), uploadedBy: 'Subhashree Mohapatra', replacesDocument: false },
    { batchId: 'batch-3', filename: 'IMG_20261106_181102.jpg', contentType: 'image/jpeg', sizeBytes: 2_104_002, pages: 1,
      status: 'FAILED', uploadedAtUtc: at(1, '18:11:00'), uploadedBy: 'Subhashree Mohapatra', replacesDocument: true },
  ],
};
const pricing = {
  bookingDate: BOOKING_DATE, bookingDateMissing: false, invoiceDate: INVOICE_DATE, appliedDate: BOOKING_DATE, basis: 'BOOKING_DATE',
  reason: null, setByActorId: null, setAtUtc: null,
  appliedPriceList: { priceListVersionId: 'plv-oct', priceList: 'Mahindra Orissa retail price list Oct 2026', version: 3, effectiveFrom: dayOffset(36), effectiveTo: dayOffset(6) },
  appliedSchemeCount: 4,
  options: [
    { basis: 'BOOKING_DATE', date: BOOKING_DATE, priceList: { priceListVersionId: 'plv-oct', priceList: 'Mahindra Orissa retail price list Oct 2026', version: 3, effectiveFrom: dayOffset(36) }, schemeVersions: ['sv-1', 'sv-2', 'sv-3', 'sv-4'], differsFromApplied: false },
    { basis: 'INVOICE_DATE', date: INVOICE_DATE, priceList: { priceListVersionId: 'plv-nov', priceList: 'Mahindra Orissa retail price list Nov 2026', version: 1, effectiveFrom: dayOffset(5) }, schemeVersions: ['sv-5', 'sv-6'], differsFromApplied: true },
  ],
  sku: { productSkuId: 'sku-3xo-ax7l', skuCode: SKU, model: 'XUV 3XO', variant: 'AX7 L Turbo AT Diesel', colour: 'Nebula Blue with Stealth Black roof (Dual Tone)', selectionStatus: 'RESOLVED', category: 'PV' },
  modelChange: 'PROPOSE_CORRECTION',
};

// ── compliance (audit) report ───────────────────────────────────────────────
function complianceReport() {
  const failed = controlStats.BOOKING.fail + controlStats.DELIVERY.fail;
  const incomplete = controlStats.BOOKING.waiting + controlStats.DELIVERY.waiting + controlStats.DELIVERY.retry;
  return {
    generatedAtUtc: at(0, '09:15:00'),
    review: { status: 'DRAFT', reviewedAtUtc: null, reviewerRole: null, label: 'Draft · awaiting the Team Lead review' },
    header: {
      journeyId: 'journey-mobile-1', journeyReference: REFERENCE, bookingReference: 'BK/BBS/26-27/004412', productLabel: VEHICLE,
      dealerName: OUTLET.dealerName, outletName: OUTLET.outletName, customerDisplayName: CUSTOMER, vin: 'MA1NE2ZTXR6K40917',
      dealType: 'Retail · exchange · financed', financedBy: 'HDFC Bank Ltd, Janpath Branch', bookingDate: BOOKING_DATE, deliveryDate: dayOffset(1),
    },
    summary: { totalFindings: 7, openFindings: 4, resolvedFindings: 3, highOrCriticalOpen: 2 },
    sections: [
      { key: 'PRICING', label: 'Pricing and charges',
        lineItems: [
          { label: 'Ex-showroom price', detail: 'Price list Oct 2026 v3', standardAmount: 1489000, actualAmount: 1489000 },
          { label: 'Road tax + registration', detail: 'NDC against the RTO challan OD02-26-118812', standardAmount: 178680, actualAmount: 181230 },
          { label: 'Insurance premium (1+3 yr bumper-to-bumper)', detail: 'ICICI Lombard, MISP-OD-0042', standardAmount: 62450, actualAmount: 58920 },
          { label: 'Accessories kit', detail: '₹6,050 given free on the accessory invoice', standardAmount: 25000, actualAmount: 18450 },
          { label: 'Road side assistance', detail: null, standardAmount: 2999, actualAmount: null },
        ],
        flags: [
          { findingId: 'f-1', findingTypeCode: 'CHARGE_ABOVE_STANDARD', title: 'Road tax charged ₹2,550 above the RTO challan', severity: 'HIGH',
            findingClass: 'PRICING', status: 'OPEN', createdAtUtc: at(2, '12:04:00'), isNew: false },
          { findingId: 'f-2', findingTypeCode: 'AWAITING_DOCUMENT', title: 'RSA charged but no RSA invoice on file', severity: 'MEDIUM',
            findingClass: 'DOCUMENT', status: 'OPEN', createdAtUtc: at(2, '12:05:00'), isNew: true },
        ] },
      { key: 'DISCOUNTS', label: 'Discounts and scheme benefits',
        lineItems: [
          { label: 'Consumer offer', detail: 'MAH-OD-NOV26-CO-3XO v2', standardAmount: 40000, actualAmount: 40000 },
          { label: 'Exchange bonus', detail: 'MAH-OD-NOV26-EX v1 · credit note CN/BBS/26-27/00418', standardAmount: 25000, actualAmount: 30000 },
          { label: 'Corporate privilege (Govt. employee)', detail: 'Proof not on file', standardAmount: 5000, actualAmount: 7500 },
        ],
        flags: [
          { findingId: 'f-3', findingTypeCode: 'DISCOUNT_OVER_ENTITLEMENT', title: 'Exchange bonus ₹5,000 more than entitled', severity: 'HIGH',
            findingClass: 'DISCOUNT', status: 'OPEN', createdAtUtc: at(2, '12:04:00'), isNew: false },
          { findingId: 'f-4', findingTypeCode: 'PROOF_MISSING', title: 'Corporate privilege given without proof of employment', severity: 'MEDIUM',
            findingClass: 'DISCOUNT', status: 'IN_REVIEW', createdAtUtc: at(2, '12:04:00'), isNew: false },
        ] },
      { key: 'PAYMENTS', label: 'Payments and settlement',
        lineItems: [
          { label: 'Customer receipts', detail: '4 counted · 1 duplicate not counted', standardAmount: null, actualAmount: RECEIPTS },
          { label: 'Loan (HDFC Bank)', detail: 'DO HDFC/DO/BBS/26/558812', standardAmount: LOAN, actualAmount: LOAN },
          { label: 'Old vehicle (in kind)', detail: 'Maruti Suzuki Ciaz ZXi 2017 · OD02AB7781', standardAmount: 185000, actualAmount: OLD_VEHICLE },
          { label: 'Balance due', detail: 'Net payable less received', standardAmount: 0, actualAmount: net.current - PAID },
        ],
        flags: [] },
    ],
    resolvedHistory: [
      { findingId: 'f-r1', findingTypeCode: 'IMAGE_QUALITY', title: 'Receipt photo too blurred to read', severity: 'LOW', createdAtUtc: at(1, '18:12:00'),
        resolvedAtUtc: at(1, '20:30:00'), resolutionReason: 'Clearer copy uploaded by the PC' },
      { findingId: 'f-r2', findingTypeCode: 'KYC_NAME_MISMATCH', title: 'Booking name differs from PAN name', severity: 'MEDIUM', createdAtUtc: at(23, '12:00:00'),
        resolvedAtUtc: at(22, '10:00:00'), resolutionReason: 'Same person: name written with a space on the booking docket (KYC name rule)' },
      { findingId: 'f-r3', findingTypeCode: 'MINIMUM_BOOKING_AMOUNT', title: 'Booking amount below minimum', severity: 'HIGH', createdAtUtc: at(24, '11:30:00'),
        resolvedAtUtc: null, resolutionReason: null },
    ],
    verdict: { code: 'NON_COMPLIANT', label: 'Not compliant', failedControls: failed, incompleteControls: incomplete, openTasks: 5,
      duplicatePairs: duplicatePairs.length, highOrCriticalFindings: 2 },
    stage: { code: 'DELIVERY_VERIFY_DOCUMENTS', gates, delivery: deliveryGate },
    controls,
    controlStatistics: controlStats,
    deal: {
      summary: dealSummary, sku: deal.sku,
      flaggedLines: flaggedRows.map((r) => ({ label: r.label, category: categories.find((c) => c.components.includes(r))?.label ?? 'Discounts',
        standard: r.standard ?? r.entitled ?? null, booking: r.booking, billed: r.billed, ledger: r.ledger, variance: r.variance, flags: r.flags })),
    },
    duplicates: duplicatePairs,
    openTasks: [
      { task_id: 'task-1', title: 'Verify road tax on the NDC', task_type: 'VERIFY_FIELD', priority: 'HIGH', assigned_role_code: 'PC', task_status: 'READY', due_at_utc: at(1, '18:00:00') },
      { task_id: 'task-2', title: 'Upload the RSA invoice', task_type: 'UPLOAD_DOCUMENT', priority: 'NORMAL', assigned_role_code: 'PC', task_status: 'IN_PROGRESS', due_at_utc: at(-1, '18:00:00') },
      { task_id: 'task-4', title: 'Upload proof of employment for corporate privilege', task_type: 'UPLOAD_DOCUMENT', priority: 'HIGH', assigned_role_code: 'PC', task_status: 'RETURNED', due_at_utc: at(0, '18:00:00') },
      { task_id: 'task-5', title: 'Review the possible duplicate booking (same PAN)', task_type: 'REVIEW_DUPLICATE', priority: 'HIGH', assigned_role_code: 'TL', task_status: 'READY', due_at_utc: at(2, '18:00:00') },
      { task_id: 'task-accept-1', title: 'Accept or reject the Reviewer closure', task_type: 'TL_CLOSURE_ACCEPTANCE', priority: null, assigned_role_code: 'TL', task_status: 'READY', due_at_utc: at(-4, '09:40:00') },
    ],
    reviewerClosure,
  };
}

// ── fixtures ────────────────────────────────────────────────────────────────
const SECTIONS = {
  deal: () => deal,
  'audit-summary': () => auditSummary,
  addons: () => addons,
  documents: () => documents360,
  payments: () => payments,
  vehicle: () => vehicle,
  invoices: () => invoices,
  tradein: () => tradein,
  customer: () => customer,
  registration: () => registration,
  compliance: () => ({ stages: controls, statistics: controlStats }),
  duplicates: () => ({ pairs: duplicatePairs }),
  'compliance-report': () => complianceReport(),
  audit: () => auditTrail,
};

export const fixtures = [
  ['GET', J('/360'), () => summary360()],
  ['GET', J('/360/([a-z-]+)'), (m) => (SECTIONS[m[1]] ? SECTIONS[m[1]]() : { __status: 404, body: { detail: `No section ${m[1]}` } })],
  ['GET', J('/pricing'), () => pricing],
  ['GET', J('/vehicle-photos'), () => photos],
  ['GET', J('/uploads'), () => uploads],
];
