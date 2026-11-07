// Mock API responses for the mobile layout harness: journeys screens. Same tuple shape as fixtures.mjs.
// Booking & Delivery list (/p2/bookings), Search (/search) and the shell calls every screen makes.
// Shapes follow src/services/audit-core/uc03P2.ts (P2JourneyListItem, P2JourneyCountsResponse,
// P2BookingsSummary, P2TemplatesResponse), uc03JourneySearch.ts, tenantAlerts.ts, uc03BulkUpload.ts,
// uploadPause.ts, accessLocations.ts, locationChecks.ts, services/hr/employees.ts (HrMe, EmployeeDetail),
// services/security/nightControl.ts, clientDiagnostics.ts and sessionObservation.ts.
import { TENANT, today, iso, outlets } from './fixtures-base.mjs';

const T = `/p2/v1/tenants/${TENANT}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const P = esc(T);

/** YYYY-MM-DD n days before today (IST calendar day). */
function daysAgo(n) {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - n));
  return date.toISOString().slice(0, 10);
}
const at = (n, t = '10:15:00') => iso(daysAgo(n), t);
const utc = (n, t = '04:45:00') => `${daysAgo(n)}T${t}Z`;

const [o1, o2] = outlets;
const pcs = [
  { id: 'pc-1', name: 'Smrutiranjan Behera' },
  { id: 'pc-2', name: 'Priyadarshini Swain' },
  { id: 'pc-3', name: null }, // a journey whose PC was not recorded
];

// One record per journey: the list item plus what the server filters on (not part of the item).
const rows = [
  {
    outlet: o1, pc: pcs[0], risk: false,
    item: {
      journey_id: 'journey-mobile-1', journey_reference: 'BKG/OD/2026/004512', phase2: true, closed: false, cancelled: false,
      customer_name: 'Bibhutibhushan Pradhan', mobile_last4: '4471', vehicle: 'Mahindra XUV 3XO AX7 L Turbo AT Diesel',
      current_stage: 'BOOKING_DOCUMENT_UPLOAD', booking_completion_state: 'IN_PROGRESS', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '21000.00', booking_minimum_amount: '21000.00', manual_verification_pending_count: 1,
      documents: 4, total_tasks: 3, open_tasks: 2, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 2, tl_open_tasks: 0,
      kyc_status: 'WAITING', docs_required: 8, docs_received: 3, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(2), planned_delivery_at: null, delivered_at: null,
      price_variance: null, delivery_started: false, opened_at: at(3, '11:02:00'), last_upload_at: at(1, '16:40:00'),
      upload_started_at: at(1, '16:38:00'), upload_finished_at: at(1, '16:51:00'), processing_now: false,
      created_at_utc: utc(3), updated_at_utc: utc(1, '11:20:00'),
    },
  },
  {
    outlet: o2, pc: pcs[1], risk: true,
    item: {
      journey_id: 'journey-mobile-2', journey_reference: 'BKG/OD/2026/004498', phase2: true, closed: false, cancelled: false,
      customer_name: 'Subhashree Mohapatra Das', mobile_last4: '9020', vehicle: 'Mahindra Scorpio-N Z8 L 4WD AT Diesel 7 Seater',
      current_stage: 'DELIVERY_VERIFY_DOCUMENTS', booking_completion_state: 'COMPLETE', delivery_completion_state: 'IN_PROGRESS',
      booking_receipt_total: '51000.00', booking_minimum_amount: '25000.00', manual_verification_pending_count: 2,
      documents: 17, total_tasks: 9, open_tasks: 5, overdue_tasks: 2, open_findings: 3, pc_open_tasks: 2, tl_open_tasks: 3,
      kyc_status: 'PASS', docs_required: 14, docs_received: 12, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(24), planned_delivery_at: at(-2), delivered_at: daysAgo(1),
      price_variance: '-18750.00', delivery_started: true, opened_at: at(25, '12:30:00'), last_upload_at: at(1, '18:05:00'),
      upload_started_at: at(1, '17:12:00'), upload_finished_at: at(1, '19:27:00'), processing_now: false,
      created_at_utc: utc(25), updated_at_utc: utc(0, '03:10:00'),
    },
  },
  {
    outlet: o1, pc: pcs[0], risk: false,
    item: {
      journey_id: 'journey-mobile-3', journey_reference: 'BKG/OD/2026/004530', phase2: true, closed: false, cancelled: false,
      customer_name: 'Rakesh Kumar Nayak', mobile_last4: '1186', vehicle: 'Mahindra Thar ROXX AX7 L 4WD AT Diesel',
      current_stage: 'BOOKING_VERIFY_DOCUMENTS', booking_completion_state: 'IN_PROGRESS', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '11000.00', booking_minimum_amount: '21000.00', manual_verification_pending_count: 0,
      documents: 6, total_tasks: 2, open_tasks: 1, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 0,
      kyc_status: 'PASS', docs_required: 8, docs_received: 6, failed_pages: 0, retrying_pages: 3,
      booking_confirm_date: null, planned_delivery_at: null, delivered_at: null,
      price_variance: null, delivery_started: false, opened_at: at(0, '09:41:00'), last_upload_at: at(0, '09:41:00'),
      upload_started_at: at(0, '09:41:00'), upload_finished_at: null, processing_now: true,
      created_at_utc: utc(0, '04:11:00'), updated_at_utc: utc(0, '04:20:00'),
    },
  },
  {
    outlet: o2, pc: pcs[1], risk: false,
    item: {
      journey_id: 'journey-mobile-4', journey_reference: 'BKG/OD/2026/004476', phase2: true, closed: false, cancelled: false,
      customer_name: 'Sasmita Rani Mishra', mobile_last4: '3307', vehicle: 'Mahindra XUV700 AX7 L Blaze Edition AT Petrol 7 Seater',
      current_stage: 'DELIVERY_DOCUMENT_UPLOAD', booking_completion_state: 'COMPLETE', delivery_completion_state: 'IN_PROGRESS',
      booking_receipt_total: '100000.00', booking_minimum_amount: '25000.00', manual_verification_pending_count: 0,
      documents: 11, total_tasks: 6, open_tasks: 2, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 2,
      kyc_status: 'PASS', docs_required: 14, docs_received: 9, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(31), planned_delivery_at: at(-4), delivered_at: null,
      price_variance: '4200.00', delivery_started: true, opened_at: at(32, '15:05:00'), last_upload_at: at(4, '12:22:00'),
      upload_started_at: at(4, '12:20:00'), upload_finished_at: at(4, '12:31:00'), processing_now: false,
      created_at_utc: utc(32), updated_at_utc: utc(4),
    },
  },
  {
    outlet: o1, pc: pcs[0], risk: true,
    item: {
      journey_id: 'journey-mobile-5', journey_reference: 'BKG/OD/2026/004402', phase2: true, closed: false, cancelled: false,
      customer_name: 'Debasish Satpathy', mobile_last4: '5582', vehicle: 'Mahindra Bolero Neo N10 (O) Diesel',
      current_stage: 'BOOKING_DOCUMENT_UPLOAD', booking_completion_state: 'IN_PROGRESS', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '5000.00', booking_minimum_amount: '21000.00', manual_verification_pending_count: 0,
      documents: 5, total_tasks: 4, open_tasks: 3, overdue_tasks: 1, open_findings: 1, pc_open_tasks: 3, tl_open_tasks: 0,
      kyc_status: 'PASS', docs_required: 8, docs_received: 4, failed_pages: 2, retrying_pages: 0,
      booking_confirm_date: daysAgo(9), planned_delivery_at: null, delivered_at: null,
      price_variance: null, delivery_started: false, opened_at: at(10, '10:00:00'), last_upload_at: at(6, '17:45:00'),
      upload_started_at: at(6, '17:40:00'), upload_finished_at: at(6, '18:02:00'), processing_now: false,
      created_at_utc: utc(10), updated_at_utc: utc(6),
    },
  },
  {
    outlet: o2, pc: pcs[2], risk: false,
    item: {
      journey_id: 'journey-mobile-6', journey_reference: null, phase2: true, closed: false, cancelled: false,
      customer_name: '6f1c2b0e-8d4a-4f6e-9b2a-7c3d5e1f0a9b', mobile_last4: null, vehicle: null,
      current_stage: 'BOOKING_DOCUMENT_UPLOAD', booking_completion_state: 'NOT_STARTED', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '0.00', booking_minimum_amount: null, manual_verification_pending_count: 0,
      documents: 0, total_tasks: 1, open_tasks: 1, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 1, tl_open_tasks: 0,
      kyc_status: null, docs_required: null, docs_received: null, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: null, planned_delivery_at: null, delivered_at: null,
      price_variance: null, delivery_started: false, opened_at: null, last_upload_at: null,
      upload_started_at: null, upload_finished_at: null, processing_now: false,
      created_at_utc: utc(0, '05:02:00'), updated_at_utc: utc(0, '05:02:00'),
    },
  },
  {
    outlet: o1, pc: pcs[1], risk: false,
    item: {
      journey_id: 'journey-mobile-7', journey_reference: 'BKG/OD/2026/004355', phase2: true, closed: true, cancelled: false,
      customer_name: 'Jyotirmayee Pattnaik', mobile_last4: '7710', vehicle: 'Mahindra XUV 3XO MX3 Pro Turbo MT Petrol',
      current_stage: 'DELIVERY_COMPLETE', booking_completion_state: 'COMPLETE', delivery_completion_state: 'COMPLETE',
      booking_receipt_total: '21000.00', booking_minimum_amount: '21000.00', manual_verification_pending_count: 0,
      documents: 19, total_tasks: 7, open_tasks: 0, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 0,
      kyc_status: 'PASS', docs_required: 14, docs_received: 14, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(40), planned_delivery_at: at(12), delivered_at: daysAgo(12),
      booking_completed_at: utc(38), delivery_completed_at: utc(11), delivery_reviewed_at: utc(9),
      price_variance: '0.00', delivery_started: true, opened_at: at(41, '11:11:00'), last_upload_at: at(12, '13:30:00'),
      upload_started_at: at(12, '13:25:00'), upload_finished_at: at(12, '13:39:00'), processing_now: false,
      reviewerClosure: { status: 'ACCEPTED', closedAtUtc: utc(9, '09:30:00') },
      created_at_utc: utc(41), updated_at_utc: utc(9),
    },
  },
  {
    outlet: o2, pc: pcs[0], risk: false,
    item: {
      journey_id: 'journey-mobile-8', journey_reference: 'BKG/OD/2026/004297', phase2: true, closed: true, cancelled: true,
      customer_name: 'Manoranjan Mohanty', mobile_last4: '2264', vehicle: 'Mahindra Scorpio Classic S11 MT Diesel 7 Seater',
      current_stage: 'BOOKING_COMPLETE', booking_completion_state: 'COMPLETE', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '25000.00', booking_minimum_amount: '25000.00', manual_verification_pending_count: 0,
      documents: 7, total_tasks: 3, open_tasks: 0, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 0,
      kyc_status: 'PASS', docs_required: 8, docs_received: 8, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(52), planned_delivery_at: null, delivered_at: null,
      price_variance: null, delivery_started: false, opened_at: at(53, '14:00:00'), last_upload_at: at(50, '10:10:00'),
      upload_started_at: null, upload_finished_at: null, processing_now: false,
      created_at_utc: utc(53), updated_at_utc: utc(30),
    },
  },
  {
    outlet: o1, pc: pcs[1], risk: true,
    item: {
      journey_id: 'journey-mobile-9', journey_reference: 'BKG/OD/2026/004461', phase2: true, closed: false, cancelled: false,
      customer_name: 'Chittaranjan Mahapatra', mobile_last4: '6093', vehicle: 'Mahindra BE 6 Pack Three 79 kWh Electric',
      current_stage: 'DELIVERY_VERIFY_DOCUMENTS', booking_completion_state: 'COMPLETE', delivery_completion_state: 'IN_PROGRESS',
      booking_receipt_total: '50000.00', booking_minimum_amount: '50000.00', manual_verification_pending_count: 3,
      documents: 15, total_tasks: 8, open_tasks: 4, overdue_tasks: 4, open_findings: 2, pc_open_tasks: 0, tl_open_tasks: 4,
      kyc_status: 'PASS', docs_required: 15, docs_received: 15, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(36), planned_delivery_at: at(3), delivered_at: daysAgo(3),
      price_variance: '-112450.00', delivery_started: true, opened_at: at(37, '16:20:00'), last_upload_at: at(3, '11:00:00'),
      upload_started_at: at(3, '10:15:00'), upload_finished_at: at(3, '13:20:00'), processing_now: false,
      reviewerClosure: { status: 'PENDING', closedAtUtc: utc(1, '12:00:00') },
      created_at_utc: utc(37), updated_at_utc: utc(1),
    },
  },
  {
    outlet: o2, pc: pcs[1], risk: false,
    item: {
      journey_id: 'journey-mobile-10', journey_reference: 'BKG/OD/2026/004521', phase2: true, closed: false, cancelled: false,
      customer_name: 'Ananya Priyadarshini Senapati', mobile_last4: '8845', vehicle: 'Mahindra XUV 3XO AX5 L Turbo MT Petrol',
      current_stage: 'BOOKING_COMPLETE', booking_completion_state: 'COMPLETE', delivery_completion_state: 'NOT_STARTED',
      booking_receipt_total: '21000.00', booking_minimum_amount: '21000.00', manual_verification_pending_count: 0,
      documents: 8, total_tasks: 2, open_tasks: 0, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 0,
      kyc_status: 'PASS', docs_required: 8, docs_received: 8, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(5), planned_delivery_at: at(-10), delivered_at: null, booking_completed_at: utc(4),
      price_variance: null, delivery_started: false, opened_at: at(6, '12:12:00'), last_upload_at: at(5, '15:48:00'),
      upload_started_at: at(5, '15:40:00'), upload_finished_at: at(5, '15:52:00'), processing_now: false,
      created_at_utc: utc(6), updated_at_utc: utc(4),
    },
  },
  {
    outlet: o1, pc: pcs[0], risk: false,
    item: {
      journey_id: 'journey-mobile-11', journey_reference: 'BKG/OD/2026/004219', phase2: false, closed: true, cancelled: false,
      customer_name: 'Pradeep Kumar Sahoo', mobile_last4: '0912', vehicle: 'Mahindra Bolero B6 (O) MT Diesel',
      current_stage: 'DELIVERY_COMPLETE', booking_completion_state: 'COMPLETE', delivery_completion_state: 'COMPLETE',
      booking_receipt_total: '11000.00', booking_minimum_amount: '11000.00', manual_verification_pending_count: 0,
      documents: 16, total_tasks: 5, open_tasks: 0, overdue_tasks: 0, open_findings: 0, pc_open_tasks: 0, tl_open_tasks: 0,
      kyc_status: null, docs_required: null, docs_received: null, failed_pages: 0, retrying_pages: 0,
      booking_confirm_date: daysAgo(61), planned_delivery_at: at(33), delivered_at: daysAgo(33),
      booking_completed_at: utc(58), delivery_completed_at: utc(33), delivery_reviewed_at: null,
      price_variance: '1500.00', delivery_started: true, opened_at: at(62, '10:30:00'), last_upload_at: at(33, '17:10:00'),
      upload_started_at: null, upload_finished_at: null, processing_now: false,
      created_at_utc: utc(62), updated_at_utc: utc(33),
    },
  },
];

for (const r of rows) {
  r.item.dealer_name = r.outlet.dealerName;
  r.item.outlet_name = r.outlet.outletName;
  r.item.outlet_code = r.outlet.outletClassification === 'MAIN' ? 'AHPL-TMD-01' : 'AHPL-PTA-SAT-02';
  r.item.pc_name = r.pc.name;
}

const isOpen = (r) => !r.item.closed;
const VIEWS = {
  all: () => true,
  open: isOpen,
  closed: (r) => Boolean(r.item.closed),
  booking_open: (r) => isOpen(r) && !String(r.item.current_stage).startsWith('DELIVERY'),
  delivery_open: (r) => isOpen(r) && String(r.item.current_stage).startsWith('DELIVERY'),
  needs_action: (r) => isOpen(r) && ((r.item.pc_open_tasks ?? 0) > 0 || (r.item.failed_pages ?? 0) > 0),
  processing: (r) => isOpen(r) && Boolean(r.item.processing_now || r.item.retrying_pages),
  with_tl: (r) => isOpen(r) && (r.item.tl_open_tasks ?? 0) > 0 && !(r.item.pc_open_tasks ?? 0),
  needs_tl: (r) => isOpen(r) && (r.item.tl_open_tasks ?? 0) > 0,
  high_risk: (r) => isOpen(r) && r.risk,
  overdue: (r) => isOpen(r) && r.item.overdue_tasks > 0,
  stuck: (r) => isOpen(r) && (r.item.failed_pages ?? 0) > 0,
};

/** The rows the URL's filters keep: q, month (YYYY-MM of opened_at), outlet_id, pc_actor_id. */
function filtered(url) {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const month = url.searchParams.get('month') || '';
  const outletId = url.searchParams.get('outlet_id') || '';
  const pcId = url.searchParams.get('pc_actor_id') || '';
  return rows.filter((r) => {
    if (outletId && r.outlet.outletId !== outletId) return false;
    if (pcId && r.pc.id !== pcId) return false;
    if (month && !(r.item.opened_at || r.item.created_at_utc || '').startsWith(month)) return false;
    if (q) {
      const hay = [r.item.customer_name, r.item.vehicle, r.item.outlet_name, r.item.journey_reference, r.item.journey_id, r.item.mobile_last4]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function countsOf(list) {
  return Object.fromEntries(Object.entries(VIEWS).map(([k, f]) => [k, list.filter(f).length]));
}

function breakdown(list) {
  const c = countsOf(list);
  return {
    total: c.all, booking_open: c.booking_open, delivery_open: c.delivery_open, open: c.open,
    needs_tl: c.needs_tl, overdue: c.overdue, high_risk: c.high_risk, stuck: c.stuck, closed: c.closed,
  };
}

function journeyCounts(url) {
  const list = filtered(url);
  const body = { counts: countsOf(list) };
  if (url.searchParams.get('breakdown') === 'true') {
    body.byOutlet = outlets.map((o) => ({
      outlet_id: o.outletId, outlet_name: o.outletName,
      outlet_code: o.outletClassification === 'MAIN' ? 'AHPL-TMD-01' : 'AHPL-PTA-SAT-02',
      ...breakdown(list.filter((r) => r.outlet.outletId === o.outletId)),
    }));
    body.byPc = pcs.map((p) => ({ pc_actor_id: p.name ? p.id : null, pc_name: p.name, ...breakdown(list.filter((r) => r.pc.id === p.id)) }));
  }
  return body;
}

function journeyPage(url) {
  const view = url.searchParams.get('view') || url.searchParams.get('state') || 'all';
  const keep = VIEWS[view] ?? VIEWS.all;
  let list = filtered(url).filter(keep);
  if (url.searchParams.get('sort') === 'outlet') {
    list = [...list].sort((a, b) => a.item.outlet_name.localeCompare(b.item.outlet_name));
  }
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || 50);
  const page = list.slice(offset, offset + limit);
  const next = offset + limit < list.length ? offset + limit : null;
  return { items: page.map((r) => r.item), view, offset, nextOffset: next };
}

function bookingsSummary() {
  const c = countsOf(rows);
  const open = rows.filter(isOpen);
  const pc = open.reduce((s, r) => s + (r.item.pc_open_tasks ?? 0), 0);
  const tl = open.reduce((s, r) => s + (r.item.tl_open_tasks ?? 0), 0);
  return {
    open: { bookings: c.booking_open, deliveries: c.delivery_open },
    closed: { bookings: 148, deliveries: 131 },
    tasks: { open: open.reduce((s, r) => s + r.item.open_tasks, 0), pc, tl },
    week: { bookingsStarted: 23, bookingsCompleted: 17, deliveriesCompleted: 12 },
    month: { bookingsStarted: 214, bookingsCompleted: 176, deliveriesCompleted: 139, avgBookingHours: 31.5, avgDeliveryHours: 52.25 },
  };
}

// ---- Search (/search): /v1/tenants/{t}/uc03/journey-search?q=&limit= -----------------------------
const MATCH_BY = [
  ['DEALER_BOOKING_NUMBER', (r) => r.item.journey_reference],
  ['MOBILE_NUMBER', (r) => r.item.mobile_last4],
  ['CUSTOMER_ENTERED_NAME', (r) => r.item.customer_name],
  ['DMS_REFERENCE', (r) => r.item.vehicle],
];
const BOOKING_STATUS = { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'BOOKING_IN_PROGRESS', COMPLETE: 'BOOKING_COMPLETE' };
const DELIVERY_STATUS = { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'DELIVERY_IN_PROGRESS', COMPLETE: 'COMPLETED' };
const LEGAL = {
  'journey-mobile-1': 'BIBHUTIBHUSHAN PRADHAN', 'journey-mobile-2': 'SUBHASHREE MOHAPATRA DAS',
  'journey-mobile-9': 'CHITTARANJAN MAHAPATRA',
};

function search(url) {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Number(url.searchParams.get('limit') || 12);
  const items = [];
  for (const r of rows) {
    const hit = MATCH_BY.find(([, get]) => (get(r) || '').toLowerCase().includes(q));
    if (!q || !hit || !r.item.journey_reference) continue;
    items.push({
      journeyId: r.item.journey_id,
      customerDisplayName: r.item.customer_name,
      customerLegalName: LEGAL[r.item.journey_id] ?? null,
      customerMobileLast4: r.item.mobile_last4 ?? null,
      bookingReference: r.item.journey_reference ?? null,
      productLabel: r.item.vehicle ?? null,
      dealerId: r.outlet.dealerId, dealerName: r.outlet.dealerName,
      outletId: r.outlet.outletId, outletName: r.outlet.outletName,
      bookingStatus: r.item.cancelled ? 'BOOKING_CANCELLED' : BOOKING_STATUS[r.item.booking_completion_state] ?? null,
      deliveryStatus: DELIVERY_STATUS[r.item.delivery_completion_state] ?? null,
      vin: r.item.delivery_started ? `MA1NE2ZT4R${r.item.journey_id.slice(-1)}6K0${r.item.mobile_last4 ?? '0000'}` : null,
      registrationNumber: r.item.delivered_at ? `OD02BV${r.item.mobile_last4 ?? '0000'}` : null,
      invoiceReference: r.item.delivery_started ? `INV/AHPL/26-27/0${r.item.mobile_last4 ?? '0000'}` : null,
      matchedOn: hit[0], matchedValue: hit[1](r) ?? null,
      latestActivityAtUtc: r.item.updated_at_utc,
      closed: Boolean(r.item.closed),
      reviewerClosure: r.item.reviewerClosure ?? null,
    });
  }
  const page = items.slice(0, limit);
  return { query: url.searchParams.get('q') || '', items: page, resultCount: page.length };
}

// ---- Document templates (GET .../templates) --------------------------------------------------------
const field = (key, label, type = 'string', required = true, isKey = false) => ({ key, label, type, required, isKey, reviewThreshold: 85 });
const template = (key, displayName, stage, requirement, keyFields, extra = {}) => ({
  key, displayName, stage, requirement, condition: null, pageShape: 'SINGLE', maxPages: 2, diTypes: [key], reviewThreshold: 85,
  keyFields, fields: keyFields.map((k, i) => field(k, k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), 'string', true, i === 0)),
  ...extra,
});
const templates = {
  version: 7,
  templates: [
    template('booking_form', 'Booking Form', 'BOOKING', 'REQUIRED', ['booking_number', 'customer_name', 'model', 'variant', 'booking_date'], { maxPages: 4, pageShape: 'MULTI' }),
    template('pan_card', 'PAN Card', 'BOOKING', 'REQUIRED', ['pan_number', 'name', 'date_of_birth']),
    template('aadhaar', 'Aadhaar', 'BOOKING', 'REQUIRED', ['aadhaar_last4', 'name', 'address'], { pageShape: 'MULTI' }),
    template('dealer_receipt', 'Booking Payment Receipt', 'BOOKING', 'REQUIRED', ['receipt_number', 'amount_paid', 'receipt_date']),
    template('cost_sheet', 'Cost Sheet', 'BOOKING', 'REQUIRED', ['ex_showroom', 'total_on_road', 'discount_total'], { maxPages: 3, pageShape: 'MULTI' }),
    template('corporate_id', 'Corporate ID', 'DELIVERY', 'CONDITIONAL', ['employee_id', 'company_name'],
      { condition: 'The deal claims a corporate discount.' }),
    template('tax_invoice', 'Vehicle Tax Invoice', 'DELIVERY', 'REQUIRED', ['invoice_number', 'invoice_date', 'vin', 'grand_total'], { maxPages: 3, pageShape: 'MULTI' }),
    template('insurance_policy', 'Insurance Policy', 'DELIVERY', 'REQUIRED', ['policy_number', 'insurer', 'idv', 'premium'], { maxPages: 6, pageShape: 'MULTI' }),
    template('rsa_invoice', 'RSA Invoice', 'DELIVERY', 'CONDITIONAL', ['invoice_number', 'amount'], { condition: 'The deal sells roadside assistance.' }),
    template('loan_statement', 'Loan Sanction / Disbursement', 'DELIVERY', 'CONDITIONAL', ['lender', 'loan_amount'],
      { condition: 'The deal is financed (a loan, not cash).' }),
    template('gate_pass', 'Gate Pass', 'DELIVERY', 'REQUIRED', ['gate_pass_number', 'vin', 'delivery_date']),
    template('upi_screenshot', 'UPI Payment Screenshot', 'BOOKING', 'SUPPORTING', ['utr', 'amount']),
    template('supporting_document', 'Others', 'BOOKING', 'SUPPORTING', [], { diTypes: [] }),
  ],
  stages: [
    { code: 'BOOKING', states: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'], gates: [
      { key: 'kyc', kind: 'DOCUMENT', label: 'Customer KYC', action: 'Upload the PAN card or Aadhaar' },
      { key: 'minimum_booking_amount', kind: 'PAYMENT', label: 'Minimum booking amount received', action: 'Upload the booking receipts' },
    ] },
    { code: 'DELIVERY', states: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'], gates: [
      { key: 'invoice', kind: 'DOCUMENT', label: 'Vehicle invoice', action: 'Upload the tax invoice' },
      { key: 'receipts_equal_invoice', kind: 'PAYMENT', label: 'Receipts equal the invoice', action: 'Upload the remaining receipts' },
    ] },
  ],
};

// ---- Shell reads ---------------------------------------------------------------------------------
const alerts = () => ({
  serverTimeUtc: new Date().toISOString(),
  items: [{
    alertId: 'alert-mobile-1', kind: 'SAME_FILE_UPLOADED', outcome: 'DELETED',
    title: 'Same file being uploaded',
    body: 'Same file being uploaded — Bibhutibhushan Pradhan, XUV 3XO AX7 L, PC Priyadarshini Swain, '
      + `${o1.dealerName}/${o2.outletName}. The new file was deleted; the booking BKG/OD/2026/004512 is kept.`,
    journeyId: 'journey-mobile-1', journeyReference: 'BKG/OD/2026/004512',
    payload: {
      customerName: 'Bibhutibhushan Pradhan', model: 'XUV 3XO', variant: 'AX7 L Turbo AT Diesel',
      newJourney: { reference: null, pcName: 'Priyadarshini Swain', pcActorId: 'pc-2', dealerName: o1.dealerName, outletName: o2.outletName },
      existingJourney: { journeyId: 'journey-mobile-1', reference: 'BKG/OD/2026/004512', pcName: 'Smrutiranjan Behera', pcActorId: 'pc-1',
        dealerName: o1.dealerName, outletName: o1.outletName },
      matchedFields: [
        { field: 'pan', label: 'PAN', newValue: 'BXXPP1234K', existingValue: 'BXXPP1234K', exact: true },
        { field: 'mobile', label: 'Mobile', newValue: '••••••4471', existingValue: '••••••4471', exact: true },
      ],
      outcome: 'DELETED',
    },
    publishedAtUtc: new Date(Date.now() - 40 * 60_000).toISOString(),
    expiresAtUtc: new Date(Date.now() + 20 * 3600_000).toISOString(),
  }],
});

const bulkUploads = () => ({
  inProgress: 0, multiOutlet: true,
  items: [{
    bulkId: 'bulk-mobile-1', outletId: o1.outletId, dealerId: o1.dealerId, status: 'DONE',
    folder: `${o1.dealerName}/${o1.outletName}/${daysAgo(1)}`, fileCount: 3,
    summary: { NEW_BOOKING: 1, ADDED_TO_BOOKING: 1, EXACT_DUPLICATE: 1 },
    createdAtUtc: utc(1, '06:00:00'), submittedAtUtc: utc(1, '06:12:00'), finishedAtUtc: utc(1, '06:40:00'),
    files: [
      { fileId: 'bf-1', filename: 'Bibhutibhushan Pradhan booking form and KYC.pdf', sizeBytes: 2_481_330, uploaded: true,
        outcome: 'ADDED_TO_BOOKING', journeyId: 'journey-mobile-1', journeyReference: 'BKG/OD/2026/004512', detail: null },
      { fileId: 'bf-2', filename: 'Rakesh Kumar Nayak.pdf', sizeBytes: 1_120_004, uploaded: true,
        outcome: 'NEW_BOOKING', journeyId: 'journey-mobile-3', journeyReference: 'BKG/OD/2026/004530', detail: null },
      { fileId: 'bf-3', filename: 'Rakesh Kumar Nayak (1).pdf', sizeBytes: 1_120_004, uploaded: true,
        outcome: 'EXACT_DUPLICATE', journeyId: null, journeyReference: null, detail: 'Same file as Rakesh Kumar Nayak.pdf' },
    ],
  }],
});

const nightFeature = (featureKey, label) => ({
  featureKey, label, enabled: true, startsAt: '20:00', endsAt: '08:30', active: false, blocked: false, allowedBy: null,
});

const employee = {
  employeeId: 'emp-mobile-1', employeeCode: 'VG-OD-0142', fullName: 'Smrutiranjan Behera', dateOfBirth: '1996-04-18', gender: 'MALE',
  mobile: '9437000142', personalEmail: 'mobile.layout@example.com', secondaryEmail: null, qualification: 'MBA',
  department: 'Audit Operations', designationCode: 'PC', designation: 'Process Consultant', address: 'Plot 221, Patia, Bhubaneswar',
  state: 'Odisha', district: 'Khordha', pincode: '751024', totalExperienceYears: 4, emergencyContactName: 'Sujata Behera',
  emergencyContactNumber: '9437000999', emergencyContactAddress: 'Plot 221, Patia, Bhubaneswar', hasPhoto: false,
  dateOfJoining: '2025-06-02', employmentStatus: 'ACTIVE', loginStatus: 'CREATED', loginErrorCode: null,
  panMasked: 'XXXXX1234X', aadhaarMasked: 'XXXX XXXX 4471', dataFlags: [], salaryStatus: 'APPROVED', missingDetails: [],
  qualifications: [], experiences: [],
};

export const fixtures = [
  // Booking & Delivery list
  ['GET', new RegExp(`${P}/journeys:counts(\\?|$)`), (_m, url) => journeyCounts(url)],
  ['GET', new RegExp(`${P}/journeys:summary(\\?|$)`), () => bookingsSummary()],
  ['GET', new RegExp(`${P}/journeys(\\?|$)`), (_m, url) => journeyPage(url)],
  ['GET', new RegExp(`${P}/templates(\\?|$)`), () => templates],
  // Search
  ['GET', new RegExp(`/v1/tenants/${esc(TENANT)}/uc03/journey-search(\\?|$)`), (_m, url) => search(url)],
  // Shell: every screen
  // The alert toast is designed to float over the page; keep it out of the captures.
  ['GET', new RegExp(`${P}/alerts(\\?|$)`), () => ({ ...alerts(), items: [] })],
  ['GET', new RegExp(`${P}/bulk-uploads(\\?|$)`), () => bulkUploads()],
  ['GET', new RegExp(`${P}/upload-pause(\\?|$)`), () => ({ paused: false, message: null, untilUtc: null, duplicateBooking: null })],
  // Result is not shown; recorded means the sign-in was noted (PC at the outlet).
  ['POST', new RegExp(`${P}/access-locations(\\?|$)`), () => ({ recorded: true, reason: null })],
  // DealGuard random check: AT_OUTLET shows no "away" note.
  ['POST', new RegExp(`${P}/location-checks(\\?|$)`), () => ({
    recorded: true, reason: null, checkId: 'lc-mobile-1', status: 'AT_OUTLET', distanceM: 42, outletId: o1.outletId,
    outletName: `${o1.dealerName} – ${o1.outletName}`, accuracyM: 20, radiusM: 500, accuracyLimitM: 150,
    checkedAtUtc: new Date().toISOString(),
  })],
  ['GET', /\/hr\/v1\/me\/employee(\?|$)/, () => employee],
  ['GET', /\/hr\/v1\/me(\?|$)/, () => ({ userId: 'user-mobile-1', permissions: [], employeeId: employee.employeeId })],
  ['GET', /\/security\/v1\/me\/night-control(\?|$)/, () => ({
    nightModeOn: false, message: 'Night Mode On', exempt: null, checkedAt: new Date().toISOString(),
    features: [nightFeature('JOURNEY_360', 'Journey 360'), nightFeature('FILE_DOWNLOAD', 'File downloads')],
  })],
  ['GET', /\/security\/v1\/me\/client-diagnostics(\?|$)/, () => ({ enabled: false })],
  ['POST', /\/security\/v1\/auth\/session-observation(\?|$)/, () => ({
    observationMode: 'OBSERVE', previousSessionSuperseded: false, previousSessionDifferentDevice: false,
    activeDeviceCount: 1, deviceLimit: 2, deviceLimitExceeded: false, geoRecorded: true,
  })],
];
