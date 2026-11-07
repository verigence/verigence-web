// Mock API responses for the mobile layout harness: supervisory screens (Team Lead, Reviewer, gate pass).
// Same tuple shape as fixtures.mjs. Shapes follow the TS types named above each block.
import { TENANT, today, outlets } from './fixtures-base.mjs';

const T = `/p2/v1/tenants/${TENANT}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const P = (suffix) => new RegExp(`${esc(T)}${suffix}`);

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const utc = (day, hhmm) => new Date(`${day}T${hhmm}:00+05:30`).toISOString();
const isSunday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
const dayLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// A third, long outlet (a different dealership) to stress names.
const longOutlet = {
  dealerId: 'd2', dealerName: 'Utkal Automobiles & Mahindra Mobility Private Limited', outletId: 'o3',
  outletName: 'Utkal Mahindra - Cuttack Jagatpur Industrial Estate Satellite Showroom', outletClassification: 'SATELLITE',
};
const allOutlets = [...outlets, longOutlet];
const O = (i) => allOutlets[i % allOutlets.length];

const PCS = [
  { id: 'pc-subhakanta', name: 'Subhakanta Jena' },
  { id: 'pc-priyabrata', name: 'Priyabrata Mohapatra' },
  { id: 'pc-sasmita', name: 'Sasmita Rani Pattanaik' },
  { id: 'pc-debasish', name: 'Debasish Kumar Swain' },
  { id: 'pc-rashmi', name: 'Rashmi Ranjan Behera' },
];
const CUSTOMERS = [
  'Sri Jagannath Prasad Mohapatra',
  'Smt. Kalyani Priyadarshini Satpathy',
  'M/s Kalinga Infrastructure & Earthmovers Private Limited',
  'Lingaraj Narayan Dash',
  'Swagatika Sucharita Nayak',
  'Chandrasekhar Venkataraman Iyer',
  'Pradyumna Kumar Routray',
  'Arpita Mohanty',
  'Biswajit Panigrahi',
  'Dr. Sitakanta Mahapatra Samantaray',
];
const MODELS = [
  ['XUV700', 'AX7 L Diesel AT AWD 7 Seater'], ['Scorpio-N', 'Z8 L Diesel 4WD AT 6 Seater'], ['Thar ROXX', 'AX7L 4WD Diesel AT'],
  ['XUV 3XO', 'AX5 L Turbo Petrol MT'], ['Bolero Neo', 'N10 (O)'], ['XUV400 EV', 'EL Pro 39.4 kWh Dual Tone'],
];
const ref = (i) => `JRN-MAH-OD-2026-${String(1840 + i).padStart(6, '0')}`;
const jid = (i) => `journey-sup-${i}`;

// ── Duplicate bookings: DuplicateBookingPair / DeletedDuplicateBooking (uc03P2.ts) ──────────────
const side = (i, extra = {}) => ({
  journeyId: jid(i), journeyReference: ref(i), customerName: CUSTOMERS[i % CUSTOMERS.length],
  dealerName: O(i).dealerName, outletName: O(i).outletName, productLabel: `${MODELS[i % MODELS.length][0]} ${MODELS[i % MODELS.length][1]}`,
  bookingReference: `BKG/MAH/2026/${String(40210 + i * 7)}`, bookingConfirmDate: addDays(today, -(i + 2)),
  pcName: PCS[i % PCS.length].name, closed: false, reviewerClosure: null, ...extra,
});
const MATCH = [
  ['PAN', 'Same PAN', 'HIGH', 'CRITICAL', [['pan', 'PAN', 'ABCPM1234K', 'ABCPM1234K', true], ['mobile', 'Mobile', '9437012345', '9437012345', true]]],
  ['AADHAAR', 'Same Aadhaar', 'HIGH', 'CRITICAL', [['aadhaar', 'Aadhaar', 'XXXX XXXX 4821', 'XXXX XXXX 4821', true]]],
  ['NAME_MOBILE', 'Same name and mobile', 'MEDIUM', 'HIGH', [['name', 'Customer name', 'Sri Jagannath Prasad Mohapatra', 'Jagannath P. Mohapatra', false], ['mobile', 'Mobile', '9861123456', '9861123456', true]]],
  ['SURNAME_PINCODE', 'Same surname and pincode', 'MEDIUM', 'MEDIUM', [['surname', 'Surname', 'Satpathy', 'Satpathy', true], ['pincode', 'Pincode', '751024', '751024', true], ['address', 'Address', 'Plot 1142, Sector 6, Niladri Vihar, Chandrasekharpur, Bhubaneswar', 'Plot No 1142 Niladri Vihar Chandrasekharpur BBSR', false]]],
  ['GSTIN', 'Same GSTIN', 'MEDIUM', 'HIGH', [['gstin', 'GSTIN', '21AABCK1234M1Z5', '21AABCK1234M1Z5', true]]],
  ['MOBILE', 'Same mobile', 'LOW', 'LOW', [['mobile', 'Mobile', '7008123456', '7008123456', true]]],
  ['RELATIVE', "Relative's name", 'MEDIUM', 'MEDIUM', [['relative', "Father's / husband's name", 'Late Bhagaban Chandra Routray', 'Bhagabana Ch. Routray', false]]],
];
function duplicatePairs(includeClosed) {
  const pairs = MATCH.map(([basis, label, conf, severity, fields], i) => ({
    findingId: `dup-${i}`, status: i === 5 ? 'IN_REVIEW' : 'OPEN', severity, raisedAtUtc: utc(addDays(today, -i), '11:4' + (i % 10)),
    matchBasis: basis, matchBasisLabel: label, matchConfidencePercent: conf === 'HIGH' ? 96 : 72, matchConfidenceLabel: conf,
    matchedFields: fields.map(([field, lbl, thisValue, otherValue, exact]) => ({ field, label: lbl, thisValue, otherValue, exact })),
    holder: side(i, i === 2 ? { closed: true, reviewerClosure: { status: 'PENDING', closedAtUtc: utc(addDays(today, -1), '16:10') } } : {}),
    duplicate: side(i + 3, i === 4 ? { pcName: null, outletName: null, dealerName: null } : {}),
  }));
  if (includeClosed) {
    pairs.push({ ...pairs[0], findingId: 'dup-closed', status: 'CONFIRMED_REPEAT_CUSTOMER', severity: 'LOW',
      holder: side(8, { closed: true }), duplicate: side(9, { closed: true, reviewerClosure: { status: 'ACCEPTED', closedAtUtc: utc(addDays(today, -6), '12:00') } }) });
  }
  return { generatedAtUtc: utc(today, '10:15'), pairs };
}
function deletedDuplicates() {
  return {
    generatedAtUtc: utc(today, '10:15'),
    items: Array.from({ length: 7 }, (_, i) => ({
      deletionId: `del-${i}`, deletedAtUtc: utc(addDays(today, -i), `1${i}:2${i}`), status: 'DELETED',
      journeyId: jid(20 + i), journeyReference: ref(20 + i), keptJourneyId: i === 6 ? null : jid(i), keptJourneyReference: ref(i),
      customerName: CUSTOMERS[(i + 2) % CUSTOMERS.length], pcName: PCS[i % PCS.length].name,
      dealerName: O(i).dealerName, outletName: O(i).outletName, model: `${MODELS[i % MODELS.length][0]} ${MODELS[i % MODELS.length][1]}`,
      pan: i === 5 ? 'XXXXX1234X' : `ABCP${'MNSKDRJ'[i]}${1234 + i}K`, aadhaarMasked: i === 5 ? null : `XXXX XXXX ${4800 + i * 13}`,
      mobile: i === 5 ? 'XXXXXX3456' : `94370${String(12345 + i * 1111).padStart(5, '0')}`,
      bookingReference: i === 5 ? null : `BKG/MAH/2026/${40210 + i * 7}`,
    })),
  };
}

// ── Discount variance: DiscountVarianceResponse (uc03DiscountVariance.ts) ───────────────────────
const DISCOUNTS = [
  ['CONSUMER_OFFER', 'Consumer offer'], ['CORPORATE_PRIVILEGE', 'Corporate privilege (Govt. & PSU employees)'],
  ['EXCHANGE_BONUS', 'Exchange bonus'], ['LOYALTY_BONUS', 'Loyalty bonus'], ['DEALER_DISCOUNT', 'Dealer discount'],
  ['ACCESSORIES_KIT', 'Accessories kit'],
];
function discountVariance() {
  const items = [];
  const doc = ['NDC / cost sheet', 'Tax invoice', 'NDC / cost sheet', 'Proforma invoice'];
  for (let i = 0; i < 9; i += 1) {
    const [model, variant] = MODELS[i % MODELS.length];
    const [key, label] = DISCOUNTS[i % 5];
    const entitled = 15000 + (i % 4) * 10000;
    const given = entitled + 2500 + i * 4175.5;
    const o = O(i);
    items.push({
      journeyId: jid(i), journeyReference: ref(i), customer: CUSTOMERS[i % CUSTOMERS.length], pc: i === 7 ? null : PCS[i % PCS.length].name,
      outlet: o.outletName, dealerId: o.dealerId, dealer: o.dealerName, outletId: o.outletId,
      bookingDate: addDays(today, -(i * 3 + 4)), deliveryDate: i % 3 ? addDays(today, -i) : null,
      model, variant, discountKey: key, discount: label, status: 'OVER_ENTITLEMENT',
      entitled: entitled.toFixed(2), invoice: given.toFixed(2), variance: (given - entitled).toFixed(2),
      givenFrom: 'billed', givenDocument: doc[i % doc.length], kit: null, reason: null,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    const o = O(i + 1);
    items.push({
      journeyId: jid(10 + i), journeyReference: ref(10 + i), customer: CUSTOMERS[(i + 4) % CUSTOMERS.length], pc: PCS[(i + 2) % PCS.length].name,
      outlet: o.outletName, dealerId: o.dealerId, dealer: o.dealerName, outletId: o.outletId,
      bookingDate: addDays(today, -(i + 6)), deliveryDate: addDays(today, -i), model: MODELS[i][0], variant: MODELS[i][1],
      discountKey: 'CONSUMER_OFFER', discount: 'Consumer offer', status: 'KIT_AS_CASH',
      entitled: '45000.00', invoice: '60000.00', variance: '15000.00', givenFrom: 'billed', givenDocument: 'NDC / cost sheet',
      kit: String(15000 + i * 2500), reason: null,
    });
  }
  const reasons = [
    'No price list on file for Scorpio-N Z8 L Diesel 4WD AT 6 Seater on the booking date.',
    'The corporate privilege policy for this employer has not been uploaded in Master Documents.',
    'Variant not resolved: the invoice says "XUV7OO AX7L DSL AT AWD" and no SKU matches.',
  ];
  reasons.forEach((reason, i) => {
    const o = O(i + 2);
    items.push({
      journeyId: jid(14 + i), journeyReference: ref(14 + i), customer: CUSTOMERS[(i + 6) % CUSTOMERS.length], pc: PCS[(i + 3) % PCS.length].name,
      outlet: o.outletName, dealerId: o.dealerId, dealer: o.dealerName, outletId: o.outletId,
      bookingDate: addDays(today, -(i + 9)), deliveryDate: null, model: MODELS[i + 1][0], variant: MODELS[i + 1][1],
      discountKey: DISCOUNTS[i + 1][0], discount: DISCOUNTS[i + 1][1], status: 'ENTITLEMENT_UNKNOWN',
      entitled: null, invoice: String(21000 + i * 5500), variance: null, givenFrom: 'billed', givenDocument: 'Tax invoice', kit: null, reason,
    });
  });
  // Under entitlement, and a figure from the booking form: neither is listed.
  items.push({ ...items[0], journeyId: jid(30), status: 'UNDER_ENTITLEMENT', variance: '-1200.00' });
  items.push({ ...items[1], journeyId: jid(31), givenFrom: 'booking', givenDocument: 'Booking form' });
  return {
    items,
    counts: { total: items.length, over: 9, under: 1, unknown: 3, kitAsCash: 4, journeys: 17 },
    notYetCalculated: 6, toleranceRupees: 500,
  };
}

// ── Daily processing: P2DailyProcessingReport (uc03P2.ts) + TmTaskStatus (taskManager.ts) ────────
const counts = (k) => ({
  files: 3 * k + 1, pages: 14 * k + 3, duplicateFiles: k % 2,
  documents: { extracted: 9 * k, readNoValues: k % 3, notRead: k % 2, waiting: k === 2 ? 2 : 0, failed: k % 3 ? 1 : 0, rejectedScans: k % 3 ? 1 : 0 },
  rejections: { faded: k % 2, blurred: k % 3 ? 1 : 0, tooSmall: 0, unreadable: k === 3 ? 1 : 0, other: 0 },
  pageMath: { multiPageDocuments: k + 1, pagesInMultiPage: 3 * k + 4, repeatPages: k % 2 },
  tasksOpened: 2 * k, tasksOpenedPc: k, tasksOpenedTl: k, tasksReopened: k % 2, autoRetries: k, retriesExhausted: k === 3 ? 1 : 0,
  pcRetries: k % 2, readAgain: 1, resyncs: 0, nightRequests: 1, nightFixed: 1,
});
const statusCounts = (k) => ({ open: 6 * k, raisedOnDay: 2 * k, completedOnDay: 3 * k, completedLate: k % 2, overdue: k, reviewOverdue: k % 2, missed: k === 2 ? 1 : 0, incomplete: k % 3 ? 1 : 0 });
function statusSection(journey) {
  const people = PCS.slice(0, 4).map((p, i) => ({ ...statusCounts(i + 1), actorId: p.id, name: p.name, role: 'PC' }));
  people.push({ ...statusCounts(1), actorId: 'tl-bibhuti', name: 'Bibhuti Bhushan Mishra', role: 'TL' });
  const flagKinds = [['OVERDUE'], ['REVIEW_OVERDUE'], ['MISSED'], ['INCOMPLETE', 'CLOSED_LATE'], ['OVERDUE']];
  return {
    totals: statusCounts(4),
    people,
    flags: flagKinds.map((flags, i) => ({
      taskId: `${journey ? 'jt' : 'tm'}-flag-${i}`, journeyId: journey ? jid(i) : null, journeyReference: journey ? ref(i) : null,
      customerName: journey ? CUSTOMERS[i] : null, outletName: O(i).outletName,
      taskType: journey ? 'UPLOAD_DOCUMENT' : 'DAILY_GATE_PASS',
      title: journey ? ['Upload the RTO registration receipt (Form 20 / Form 21)', 'Review the extended warranty invoice', 'Explain the consumer offer above entitlement', 'Upload the insurance policy schedule', 'Confirm the chassis number on the tax invoice'][i]
        : ['Daily gate pass', 'Weekly stock reconciliation with the dealership', 'Monthly CRM call list', 'Daily gate pass', 'Send the pending delivery files list to the GM'][i],
      status: 'OPEN', flags, assigneeName: PCS[i % PCS.length].name, assigneeActorId: PCS[i % PCS.length].id, assigneeRole: 'PC',
      reviewerRole: i % 2 ? 'TL' : null, reviewerName: i % 2 ? 'Bibhuti Bhushan Mishra' : null,
      dueAtUtc: utc(addDays(today, -1), '18:00'), reviewDueAtUtc: i % 2 ? utc(today, '12:00') : null,
      completedAtUtc: flags.includes('CLOSED_LATE') ? utc(today, '09:40') : null, recurring: !journey,
    })),
    flagsTruncated: false,
  };
}
function dailyReport(day) {
  const pcs = PCS.map((p, i) => ({
    ...counts(i + 1), pcActorId: p.id, pcName: i === 4 ? null : p.name, journeys: 4 + i, journeysUploaded: i === 4 ? 0 : 2 + i,
    pagesPerJourney: 8.5, firstUploadAt: utc(day, `0${9 + (i % 1)}:1${i}`), lastFinishedAt: i === 2 ? null : utc(day, `1${3 + i}:0${i}`),
    stillProcessing: i === 2 ? 2 : 0, spanMinutes: i === 2 ? null : 240 + i * 35, deliveryFilesClosed: i % 3,
  }));
  const journeys = [];
  pcs.forEach((pc, p) => {
    for (let j = 0; j < pc.journeysUploaded; j += 1) {
      const i = p * 3 + j;
      const o = O(i);
      const done = !(p === 2 && j < 2);
      journeys.push({
        ...counts((j % 3) + 1), journeyId: jid(i), customerName: j === 1 && p === 1 ? null : CUSTOMERS[i % CUSTOMERS.length],
        outletName: o.outletName, outletCode: `OD-${o.outletId.toUpperCase()}`, dealerName: o.dealerName, pcActorId: pc.pcActorId, pcName: pc.pcName,
        closed: j === 2, reviewerClosure: j === 3 ? { status: 'AUTO_ACCEPTED', closedAtUtc: utc(day, '12:00') } : null,
        uploadStartedAt: utc(day, `1${j}:0${p}`), processingFinishedAt: done ? utc(day, `1${j}:2${p}`) : null, processingMinutes: done ? 20 + j * 7 : null,
        uploadedOnDay: true,
      });
    }
  });
  const workTasks = (k) => Array.from({ length: 3 }, (_, i) => ({
    taskId: `wt-${k}-${i}`, journeyId: jid(k + i), journeyReference: ref(k + i), customerName: CUSTOMERS[(k + i) % CUSTOMERS.length],
    taskType: 'UPLOAD_DOCUMENT', title: ['Upload the RTO registration receipt', 'Correct the ex-showroom price read from the NDC', 'Explain the exchange bonus above entitlement'][i],
    status: i === 2 ? 'WAITING_FOR_REVIEW' : 'OPEN', closedOnDay: i === 0, actions: i ? ['ADD_COMMENT', 'CORRECT_EXTRACTED_FIELD'] : ['UPLOAD_DOCUMENT', 'CLOSE_TASK'],
    lastAt: utc(day, `1${i + 1}:30`), lastComment: i === 1 ? 'Customer will bring the original Form 22 tomorrow morning; dealership confirmed on call.' : null,
  }));
  const people = [...PCS.slice(0, 4).map((p, i) => ({ actorId: p.id, name: p.name, role: 'PC' })), { actorId: 'tl-bibhuti', name: 'Bibhuti Bhushan Mishra', role: 'TL' }]
    .map((p, i) => ({
      ...p, actions: 14 + i * 3, byAction: { UPLOAD_DOCUMENT: 5 + i, ADD_COMMENT: 4, CORRECT_EXTRACTED_FIELD: 3 + i, CLOSE_TASK: 2 },
      byTaskType: { UPLOAD_DOCUMENT: 6, REVIEW_DOCUMENT: 3 }, tasksWorked: 6 + i, tasksClosed: 3 + (i % 3), journeys: 4 + i,
      firstAt: utc(day, '09:2' + i), lastAt: utc(day, '18:4' + i), tasks: workTasks(i), tasksTruncated: i === 0,
    }));
  const closedFiles = (p, n) => Array.from({ length: n }, (_, i) => ({
    journeyId: jid(p * 2 + i), journeyReference: ref(p * 2 + i), customerName: CUSTOMERS[(p * 2 + i) % CUSTOMERS.length],
    dealerName: O(i).dealerName, outletName: O(p + i).outletName, outletCode: null, pcActorId: PCS[p].id, pcName: PCS[p].name,
    closedAtUtc: utc(day, `1${4 + i}:15`),
  }));
  const byPc = PCS.slice(0, 3).map((p, i) => ({ pcActorId: p.id, pcName: p.name, deliveryFilesClosed: i + 1, files: closedFiles(i, i + 1) }));
  return {
    day, timezone: 'Asia/Kolkata',
    taskStatus: { day, asOfUtc: utc(today, '10:15'), journeyTasks: statusSection(true), taskManager: statusSection(false),
      notes: ['Overdue: open past its due time.', 'Missed: a recurring task not done by the end of its day.'] },
    teamWork: { people, totals: { people: people.length, tasksWorked: people.reduce((n, p) => n + p.tasksWorked, 0), actions: 95, tasksClosed: 18 } },
    deliveryFilesClosed: { total: 6, byPc, files: byPc.flatMap((p) => p.files) },
    pcs, journeys,
    notes: [
      'A journey counts for the PC who uploaded on the day; a re-check the system made on an earlier journey is not their upload.',
      'Documents: what the pages became after splitting. A multi-page document counts once.',
      'Rejected at upload: pages the scan-quality check refused (faded, blurred, too small, unreadable).',
    ],
  };
}

// ── Closure approvals: ClosureListRow (reviewerClosure.ts) ──────────────────────────────────────
const CLOSURE_ITEMS = [
  { key: 'doc:RTO_RECEIPT', kind: 'MISSING_DOCUMENT', stage: 'DELIVERY', label: 'RTO registration receipt (Form 20 / Form 21)', requirement: 'MANDATORY',
    answer: 'Customer registered the vehicle in Andhra Pradesh through his own agent; the dealership holds a signed undertaking dated 2 Nov.' },
  { key: 'finding:EXCESS_DISCOUNT', kind: 'OPEN_FINDING', stage: 'DELIVERY', label: 'Consumer offer ₹12,500 above entitlement', severity: 'HIGH',
    answer: 'Approved by the GM Sales over email as a fleet deal for M/s Kalinga Infrastructure; approval copy is in Master Documents.' },
  { key: 'task:EW_INVOICE', kind: 'OPEN_TASK', stage: 'DELIVERY', label: 'Upload the extended warranty invoice', assignedRole: 'PC',
    answer: 'Customer declined extended warranty at delivery; declaration signed.' },
  { key: 'doc:INSURANCE', kind: 'MISSING_DOCUMENT', stage: 'DELIVERY', label: 'Insurance policy schedule', requirement: 'CONDITIONAL',
    answer: 'Insurance taken by the customer from his own bank; cover note seen and noted.' },
];
function closures(status) {
  const statuses = ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'AUTO_ACCEPTED', 'AUTO_ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'REJECTED'];
  const rows = statuses.map((s, i) => {
    const o = O(i);
    const items = CLOSURE_ITEMS.slice(0, 1 + (i % 4));
    const closedAt = utc(addDays(today, -(i % 5)), `1${i % 9}:3${i % 6}`);
    return {
      closureId: `closure-${i}`, closedBy: 'reviewer-ananya', closedRole: 'REVIEWER',
      comment: 'All mandatory documents are on file except those answered below; the deal was checked line by line against the NDC.',
      itemCount: items.length, items, counts: { MISSING_DOCUMENT: 1 }, deliveryOutcome: 'DELIVERED', closedAtUtc: closedAt,
      journeyId: jid(i), acceptanceStatus: s, acceptanceDueUtc: utc(addDays(today, 4 - (i % 5)), '16:00'), acceptanceTaskId: `task-closure-${i}`,
      decidedBy: s === 'PENDING' ? null : 'tl-bibhuti', decidedRole: s === 'ACCEPTED' || s === 'REJECTED' ? 'TL' : null,
      decidedAtUtc: s === 'PENDING' ? null : utc(today, '09:10'),
      rejections: s === 'REJECTED' ? [{ key: items[0].key, label: items[0].label, kind: items[0].kind, reason: 'An undertaking is not enough: the RTO receipt from the other state must be uploaded before closure.' }] : [],
      journeyReference: ref(i), customerName: CUSTOMERS[i % CUSTOMERS.length], outletName: o.outletName, dealerName: o.dealerName,
    };
  });
  const tally = { PENDING: 0, ACCEPTED: 0, AUTO_ACCEPTED: 0, REJECTED: 0 };
  rows.forEach((r) => { tally[r.acceptanceStatus] += 1; });
  return { status: status ?? null, counts: tally, closures: status ? rows.filter((r) => r.acceptanceStatus === status) : rows };
}

// ── Journey export: JourneyExportScope / JourneyExport (journeyExport.ts) ───────────────────────
const exportScope = (role) => ({
  role: role === 'EXECUTIVE' || role === 'PM' ? role : 'TL', maxRangeDays: 92,
  outlets: allOutlets.map(({ dealerId, dealerName, outletId, outletName }) => ({ dealerId, dealerName, outletId, outletName })),
});
function journeyExports() {
  const monthStart = `${today.slice(0, 8)}01`;
  const mk = (i, status, extra) => ({
    exportId: `exp-${i}`, status, filters: { dateBasis: 'BOOKING', dateFrom: monthStart, dateTo: today, ...(i === 1 ? { dealerId: 'd2', outletId: 'o3' } : {}) },
    fileName: `journeys_${i === 1 ? 'utkal-mahindra-cuttack-jagatpur-industrial-estate-satellite' : 'all-outlets'}_booking_${monthStart}_to_${today}.xlsx`,
    total: null, done: 0, rows: null, sizeBytes: null, error: null, requestedAtUtc: utc(today, `${String(9 + i).padStart(2, "0")}:0${i}`), finishedAtUtc: null, ...extra,
  });
  return {
    exports: [
      mk(0, 'RUNNING', { total: 214, done: 87 }),
      mk(1, 'PENDING', {}),
      mk(2, 'READY', { total: 182, done: 182, rows: 182, sizeBytes: 412_334, finishedAtUtc: utc(today, '09:12'), error: '3 journeys left out: their deal is still being calculated' }),
      mk(3, 'READY', { total: 9, done: 9, rows: 9, sizeBytes: 31_200, finishedAtUtc: utc(today, '08:40') }),
      mk(4, 'FAILED', { total: 640, done: 120, error: 'The export timed out after 10 minutes; choose a shorter range or one dealership' }),
    ],
  };
}

// ── Employee engagement: EngagementReport (taskManager.ts) ──────────────────────────────────────
const efficacy = (active, idle, k) => ({
  inUsePct: active + idle ? Math.round((100 * active) / (active + idle)) : null, avgActiveMinutesPerDayActive: active ? Math.round(active / Math.max(1, k)) : null,
  daysActivePct: 80, filesPerActiveHour: active ? Math.round((60 * 9) / active * 10) / 10 : null, tasksPerActiveHour: active ? 2.4 : null,
  onTimePct: active ? 75 + (k % 4) * 5 : null, badScanPct: active ? (k % 3) * 4.5 : null,
});
function cell(active, k, days, workingDays) {
  const idle = Math.round(active * 0.3);
  return {
    activeMinutes: active, idleMinutes: idle, backgroundMinutes: Math.round(active * 0.5),
    activeMinutesBySource: active ? { WEB: Math.round(active * 0.6), ANDROID: Math.round(active * 0.3), MOBILE_WEB: active - Math.round(active * 0.6) - Math.round(active * 0.3) } : {},
    sessions: active ? 3 * days : 0, sessionMinutes: active ? { min: 6, avg: 48, max: 162 } : { min: null, avg: null, max: null },
    daysActive: active ? days : 0, workingDays, usualStart: active ? `09:${10 + k}` : null, usualEnd: active ? `18:${30 + k}` : null,
    firstActiveAtUtc: active ? utc(today, '09:12') : null, lastActiveAtUtc: active ? utc(today, '18:40') : null,
    hourlyActiveMinutes: Array.from({ length: 24 }, (_, h) => (active && h >= 9 && h <= 18 ? Math.round(active / 10 / Math.max(1, days)) : 0)),
    journeysStarted: active ? 3 * k : 0, filesUploaded: active ? 9 * k : 0, pagesUploaded: active ? 64 * k : 0, badScans: active ? k * 2 : 0, notReadInTime: k % 2,
    journeyTasksWorked: active ? 11 + k : 0, taskActions: active ? 30 + k : 0, tasksAssigned: 6, tasksCompleted: active ? 4 + (k % 3) : 0,
    tasksCompletedOnTime: active ? 3 : 0, sendBacksReceived: k % 2, reviewsDone: 0, efficacy: efficacy(active, idle, days),
  };
}
function engagement(from, to, period) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const workDays = days.filter((d) => !isSunday(d));
  const people = [
    ...PCS.map((p) => ({ ...p, role: 'PC' })), { id: 'tl-bibhuti', name: 'Bibhuti Bhushan Mishra', role: 'TL' },
    { id: 'rv-ananya', name: 'Ananya Sahoo', role: 'REVIEWER' }, { id: 'pc-unseen', name: 'Gyanaranjan Bhuyan Satapathy', role: 'PC' },
  ].map((p, k) => {
    const perDay = k === 7 ? 0 : 420 - k * 45;
    const periods = days.map((d) => ({ ...cell(isSunday(d) ? 0 : perDay + ((k * 13 + d.charCodeAt(9)) % 40), k + 1, isSunday(d) ? 0 : 1, isSunday(d) ? 0 : 1),
      periodStart: d, label: dayLabel(d), from: d, to: d }));
    const active = periods.reduce((n, c) => n + c.activeMinutes, 0);
    return {
      actorId: p.id, name: p.name, role: p.role, activeInProject: k !== 6 || true, outlets: allOutlets.slice(0, 1 + (k % 3)).map((o) => o.outletId),
      totals: cell(active, k + 1, perDay ? workDays.length : 0, workDays.length), periods,
      days: perDay ? workDays.map((d, i) => ({
        day: d, activeMinutes: perDay, firstActiveAtUtc: utc(d, `0${8 + (k % 2)}:${String(5 + k * 6).padStart(2, '0')}`), lastActiveAtUtc: utc(d, `1${8 + (k % 2)}:${String(10 + k * 5).padStart(2, '0')}`),
        longestNoOutputMinutes: 35 + k * 9, longestNoOutputFrom: '14:20', longestNoOutputTo: `15:${String(k * 7).padStart(2, '0')}`,
        blockCounts: { WORKING: 14, ACTIVE_NO_OUTPUT: 3 + (i % 3), IDLE: 4, AWAY: 2 },
      })) : [],
    };
  });
  return {
    from, to, period, periods: days.map((d) => ({ periodStart: d, label: dayLabel(d) })), workingDays: workDays.length,
    idleThresholdMinutes: 4, sessionGapMinutes: 30, people,
    notes: ['Active: the app visible with a click, tap, key or scroll in the last 4 minutes.', 'Working days are Monday to Saturday.'],
  };
}

// ── Reviewer board / activity: ReviewerBoard, ReviewerActivity (uc03P2Reviewer.ts) ──────────────
function reviewerBoard(state, q) {
  const groups = allOutlets.map((o, g) => ({
    dealerId: o.dealerId, dealerName: o.dealerName, outletId: o.outletId, outletName: o.outletName, outletCode: `OD-${o.outletId.toUpperCase()}`,
    journeys: Array.from({ length: g === 2 ? 3 : 4 }, (_, j) => {
      const i = g * 4 + j;
      const uploadDate = addDays(today, -(3 - Math.floor(j / 2)));
      return {
        journeyId: jid(i), journeyReference: ref(i), bookingReference: j % 2 ? `BKG/MAH/2026/${40210 + i * 7}` : null,
        customerName: CUSTOMERS[i % CUSTOMERS.length], customerMobileLast4: String(3400 + i * 17).slice(-4), closed: state === 'closed',
        pcName: j === 3 ? null : PCS[(g + j) % PCS.length].name, createdAtUtc: utc(uploadDate, '11:20'), uploadDate, updatedAtUtc: utc(today, '09:00'),
        claimedByActorId: j === 1 ? 'reviewer-me' : j === 2 ? 'reviewer-sarojini.mohanty@verigence.example' : null, claimedAtUtc: j && j < 3 ? utc(today, '09:30') : null,
        claimedByMe: j === 1,
        booking: { documentCount: 6 + j, reviewedAtUtc: j === 0 ? utc(addDays(today, -1), '15:00') : null },
        delivery: { documentCount: j === 3 ? 0 : 9 + j, reviewedAtUtc: null },
      };
    }),
  }));
  const outletOptions = groups.map((g) => ({ dealerId: g.dealerId, dealerName: g.dealerName, outletId: g.outletId, outletName: g.outletName,
    outletCode: g.outletCode, journeyCount: g.journeys.length, oldestUploadDate: g.journeys[0].uploadDate }));
  const shown = q ? groups.map((g) => ({ ...g, journeys: g.journeys.slice(0, 1) })) : groups;
  const count = shown.reduce((n, g) => n + g.journeys.length, 0);
  return { state, journeyCount: count, totalMatching: count, timezone: 'Asia/Kolkata', outletOptions, outlets: shown };
}
function reviewerActivity(period) {
  const step = period === 'week' ? 7 : 1;
  const start = period === 'week' ? addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7)) : today;
  return {
    period, timezone: 'Asia/Kolkata', actorId: 'reviewer-me',
    buckets: Array.from({ length: 7 }, (_, b) => ({
      bucket: addDays(start, -b * step), bookingReviewed: 6 + b * step, deliveryReviewed: 4 + b, journeys: 8 + b * step, fieldChanges: b % 3 ? 5 + b : 0,
      outlets: allOutlets.flatMap((o, i) => ['BOOKING', 'DELIVERY'].map((stageCode, s) => ({
        outletId: o.outletId, outletName: o.outletName, dealerName: o.dealerName, stageCode, marks: 2 + i + s + b, journeys: 2 + i + b,
      }))).slice(0, b % 2 ? 6 : 4),
    })),
  };
}

/** The Reviewer shape of MyWork (uc03MyWork.ts) for /p2/tracker. Not wired here: the shell's my-work fixture
 * cannot fall through by role; fixtures.mjs can return this when role === 'REVIEWER'. */
export function reviewerMyWork(url) {
  const from = url?.searchParams.get('from') || addDays(today, -6);
  const to = url?.searchParams.get('to') || today;
  const by = url?.searchParams.get('by') || 'day';
  const fig = (k) => ({ journeysWorked: 7 * k, reviewsClosed: 5 * k, corrections: 3 * k, tasksWorked: 4 * k, tasksClosed: 3 * k });
  const days = [];
  for (let d = to; d >= from && days.length < 31; d = addDays(d, -1)) days.push(d);
  const outletsOut = allOutlets.map((o, i) => ({ outletId: o.outletId, outletName: o.outletName, dealerId: o.dealerId, dealerName: o.dealerName,
    classification: o.outletClassification, ...fig(i + 1), tasksPending: 2 + i }));
  return {
    role: 'REVIEWER', from, to, by, outlets: outletsOut, totals: { ...fig(6), tasksPending: 9 },
    periods: days.map((d, n) => ({ from: d, to: d, label: n === 0 ? 'Today' : dayLabel(d),
      outlets: allOutlets.map((o, i) => ({ outletId: o.outletId, outletName: o.outletName, classification: o.outletClassification, ...fig((i + n) % 3) })),
      totals: fig(3) })),
  };
}

// ── Gate pass: GatePassOutlets, GatePassDays, GatePassCalendar, GatePassSummary, DailyTask (uc03GatePass.ts) ──
const gpOutlets = allOutlets.map((o, i) => ({ dealerId: o.dealerId, dealerName: o.dealerName, outletId: o.outletId, outletName: o.outletName,
  classification: o.outletClassification, isDefault: i === 0 }));
const windowDays = () => {
  const out = [];
  for (let n = 0; n <= 7; n += 1) {
    const d = addDays(today, -n);
    if (isSunday(d)) continue;
    const covers = new Date(`${d}T00:00:00Z`).getUTCDay() === 1 ? [addDays(d, -1), d] : [d];
    out.push({ date: d, label: dayLabel(d), coversDates: covers, dueAtUtc: utc(addDays(d, 1), '11:00') });
  }
  return out;
};
const gatePass = (i, date, extra = {}) => ({
  gatePassId: `gp-sup-${i}`, outletId: O(i).outletId, outletName: O(i).outletName, pcName: PCS[i % PCS.length].name, businessDate: date,
  status: 'COMPLETED', dayLabel: dayLabel(date), coversDates: [date], photoQuality: i % 3 ? 'GOOD' : 'BLURRED', photoMode: 'COMBINED',
  pages: [{ pageNo: 1, position: 1, date, photoQuality: 'GOOD' }, { pageNo: 2, position: 2, date, photoQuality: 'BLURRED' }],
  photosEditable: true, editableUntil: addDays(date, 3), pagesEditCount: 0, uploadedLate: i === 2,
  newDeliveries: 7 + i, stockTransfers: i % 2, testDrives: 2, otherCount: 0, otherNote: null, deliveryFiles: 5 + i,
  divergence: 'MISSING_FILES', pastDeliveryNote: null, filesHeld: null, countsSubmitted: true, completed: true,
  notNotifiedToPc: 1, notUploadedByPc: 1, intimatedToPc: 6 + i, countsEditable: true, countsEditCount: i, countsEditedAtUtc: null,
  countsHistory: [], dayCounts: null, ...extra,
});
function gatePassOutletsBody() {
  const days = windowDays();
  return {
    businessDate: today, outlets: gpOutlets, defaultOutletId: 'o1',
    today: isSunday(today) ? null : days[0], previous: days[1] ?? null, previousOpenOutletIds: ['o3'],
    editableToday: [gatePass(0, today), gatePass(2, days[1]?.date ?? today)],
    window: { today, uploadFrom: addDays(today, -7), editFrom: addDays(today, -3), uploadBackDays: 7, editBackDays: 3, maxPages: 4, days },
  };
}
function gatePassDays(outletId) {
  const outlet = gpOutlets.find((o) => o.outletId === outletId) ?? gpOutlets[0];
  return {
    today, uploadFrom: addDays(today, -7), editFrom: addDays(today, -3), uploadBackDays: 7, editBackDays: 3, maxPages: 4, outlet,
    days: windowDays().map((d, n) => {
      const state = n === 0 || n === 3 ? 'NEW' : n <= 2 ? 'EDITABLE' : 'LOCKED';
      return { ...d, isToday: n === 0, state, canUpload: state === 'NEW', canEdit: state === 'EDITABLE',
        register: state === 'NEW' ? null : gatePass(n, d.date, { countsSubmitted: n !== 2 }),
        note: state === 'NEW' ? 'No register yet: upload the photo and enter the counts.' : state === 'EDITABLE'
          ? `On file: photos can be added, replaced or removed until the end of ${dayLabel(addDays(d.date, 3))}.` : 'On file and locked.' };
    }),
  };
}
function gatePassCalendar(month, outletId) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let n = 1; n <= last; n += 1) {
    const date = `${month}-${String(n).padStart(2, '0')}`;
    if (date > today || isSunday(date)) continue;
    const declared = 6 + (n % 5);
    const uploaded = declared - (n % 3);
    const notNotified = n % 4 === 0 ? 1 : 0;
    days.push({ date, declared, uploaded, missing: declared - uploaded, gatePasses: outletId ? 1 : 3, open: n % 6 === 0 ? 1 : 0,
      gatePassId: `gp-cal-${n}`, divergence: declared === uploaded ? 'NONE' : 'MISSING_FILES', notNotified, toUpload: Math.max(0, declared - uploaded - notNotified) });
  }
  const sum = (k) => days.reduce((t, d) => t + d[k], 0);
  return { month, scope: outletId ? 'OUTLET' : 'ALL', outlets: gpOutlets, days,
    totals: { declared: sum('declared'), uploaded: sum('uploaded'), missing: sum('missing'), notNotified: sum('notNotified'), toUpload: sum('toUpload') } };
}
function gatePassSummary(from, to) {
  const STAT = ['DONE', 'ANSWER_PENDING', 'COUNTS_PENDING', 'NOT_UPLOADED'];
  const dates = [];
  for (let d = from; d <= to && dates.length < 31; d = addDays(d, 1)) if (!isSunday(d)) dates.push(d);
  if (!dates.length) dates.push(to);
  const outletsOut = allOutlets.map((o, i) => {
    const days = dates.map((date, n) => {
      const status = STAT[(i + n) % 4];
      const up = status !== 'NOT_UPLOADED';
      return { date, label: dayLabel(date), status, asPerRegister: up && status !== 'COUNTS_PENDING' ? 8 + i : null, updatedInTool: 5 + i,
        notNotifiedToPc: up ? 1 : 0, pendingDueToPc: up ? 2 : 0, stockTransfers: i % 2, gatePassId: up ? `gp-sum-${i}-${n}` : null,
        pcName: up ? PCS[i].name : null, photoQuality: i === 1 ? 'TOO_DARK' : 'GOOD', pages: i === 2 ? 3 : 1, photoMode: 'COMBINED' };
    });
    const f = (k) => days.reduce((t, d) => t + (d[k] ?? 0), 0);
    return { outletId: o.outletId, outletName: o.outletName, dealerId: o.dealerId, dealerName: o.dealerName,
      teamLeads: ['Bibhuti Bhushan Mishra'], uploadedBy: [PCS[i].name, PCS[i + 1].name],
      asPerRegister: f('asPerRegister'), updatedInTool: f('updatedInTool'), notNotifiedToPc: f('notNotifiedToPc'), pendingDueToPc: f('pendingDueToPc'),
      stockTransfers: f('stockTransfers'), gatePassDays: days.length, gatePassesFinished: days.filter((d) => d.status === 'DONE').length,
      gatePassesMissing: days.filter((d) => d.status === 'NOT_UPLOADED').length, days };
  });
  const tot = (k) => outletsOut.reduce((t, o) => t + o[k], 0);
  return { from, to, outlets: outletsOut,
    totals: { asPerRegister: tot('asPerRegister'), updatedInTool: tot('updatedInTool'), notNotifiedToPc: tot('notNotifiedToPc'), pendingDueToPc: tot('pendingDueToPc'),
      stockTransfers: tot('stockTransfers'), gatePassDays: tot('gatePassDays'), gatePassesFinished: tot('gatePassesFinished'), gatePassesMissing: tot('gatePassesMissing') },
    notes: ['Pending due to PC = as per register − (updated in tool + not notified to PC).', 'Sunday is off: Monday’s gate pass covers Sunday.'] };
}
function dailyTasks(status) {
  const items = Array.from({ length: 6 }, (_, i) => ({
    dailyTaskId: `dt-${i}`, category: 'GATE_PASS', taskType: i % 2 ? 'MISSING_DELIVERY_FILES' : 'GATE_PASS_NOT_UPLOADED',
    title: i % 2 ? `${2 + i} deliveries on the gate register have no delivery file in the tool` : 'Gate pass not uploaded by 11:00',
    description: i % 2 ? `The register shows ${8 + i} deliveries; ${6} delivery files were uploaded with that day's vehicle gate pass. Ask the PC to upload the rest or explain.`
      : `${PCS[i % PCS.length].name} has not uploaded the gate register photo for ${O(i).outletName}.`,
    priority: i % 3 ? 'HIGH' : 'MEDIUM', status: i < 4 ? 'OPEN' : 'DONE', outletId: O(i).outletId, outletName: O(i).outletName,
    businessDate: addDays(today, -(i + 1)), gatePassId: i % 2 ? `gp-sup-${i}` : null, createdAtUtc: utc(addDays(today, -i), '11:05'),
    resolvedAtUtc: i >= 4 ? utc(today, '09:00') : null, resolutionNote: i >= 4 ? 'PC uploaded the two missing files after the customer returned the signed Form 21.' : null,
  }));
  return { items: status === 'ALL' ? items : items.filter((t) => t.status === status) };
}

export const fixtures = [
  // Duplicate bookings (uc03P2.ts): the Deleted tab first, its path extends the list's.
  ['GET', /\/v1\/tenants\/[^/]+\/uc03\/duplicate-bookings\/deleted/, () => deletedDuplicates()],
  ['GET', /\/v1\/tenants\/[^/]+\/uc03\/duplicate-bookings(\?|$)/, (_m, url) => duplicatePairs(url.searchParams.get('includeClosed') === 'true')],
  ['GET', P('/discounts/variance'), () => discountVariance()],
  ['GET', P('/reports/daily-processing'), (_m, url) => dailyReport(url.searchParams.get('day') || today)],
  ['GET', P('/reviewer-closures'), (_m, url) => closures(url.searchParams.get('status') || undefined)],
  ['GET', P('/reports/journey-exports/scope'), (_m, _u, role) => exportScope(role)],
  ['GET', P('/reports/journey-exports(\\?|$)'), () => journeyExports()],
  ['GET', P('/reports/engagement(\\?|$)'), (_m, url) => engagement(url.searchParams.get('from') || addDays(today, -6), url.searchParams.get('to') || today, url.searchParams.get('period') || 'day')],
  ['GET', P('/reviewer/journeys'), (_m, url) => reviewerBoard(url.searchParams.get('state') || 'open', url.searchParams.get('q'))],
  ['GET', P('/reviewer/activity'), (_m, url) => reviewerActivity(url.searchParams.get('period') === 'week' ? 'week' : 'day')],
  ['GET', P('/gate-passes/outlets'), () => gatePassOutletsBody()],
  ['GET', P('/gate-passes/days'), (_m, url) => gatePassDays(url.searchParams.get('outletId'))],
  ['GET', P('/gate-passes/calendar'), (_m, url) => gatePassCalendar(url.searchParams.get('month') || today.slice(0, 7), url.searchParams.get('outletId'))],
  ['GET', P('/gate-passes/summary'), (_m, url) => gatePassSummary(url.searchParams.get('from') || today, url.searchParams.get('to') || today)],
  ['GET', P('/daily-tasks'), (_m, url) => dailyTasks(url.searchParams.get('status') || 'OPEN')],
];
