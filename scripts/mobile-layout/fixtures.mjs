// Mock API responses for the mobile layout harness. Shapes follow src/services/** types.
// Each entry: [method or '*', RegExp on pathname+search, (match, url, role) => body | {status, body}].

import { TENANT, today, iso, outlets } from './fixtures-base.mjs';
import { fixtures as journeys } from './fixtures-journeys.mjs';
import { fixtures as journey360 } from './fixtures-journey360.mjs';
import { fixtures as documentsTasks } from './fixtures-documents-tasks.mjs';
import { fixtures as supervisory, reviewerMyWork } from './fixtures-supervisory.mjs';

function project(role) {
  return {
    tenantId: TENANT, projectCode: 'MAH-OD', projectName: 'Mahindra Orissa', projectStatus: 'ACTIVE',
    timezoneName: 'Asia/Kolkata', operatingRole: role,
    scope: { allDealers: false, dealerCount: 1, outletCount: outlets.length, outlets },
  };
}

const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const gateDay = (date, status, i = 0) => ({
  date, label: date, dueAtUtc: `${date}T05:30:00Z`, status, total: 6 + i, intimated: 5, uploadedInTool: 4 + i,
  pendingWithPc: 1, notIntimated: 1, gatePassId: status === 'DONE' ? `gp-${i}` : null, pages: status === 'DONE' ? 2 : 0,
  uploadedAtUtc: status === 'DONE' ? `${date}T04:00:00Z` : null,
});
const pcFigures = (k = 1) => ({
  journeysTotal: 214 * k, journeysUploaded: 12 * k, bookingsUploaded: 8 * k, deliveriesUpdated: 5 * k, journeysCompleted: 3 * k,
  gateRegisterDays: 1, gateRegisterUploaded: 1, gateRegisterMissed: 0, registerTotal: 9 * k, registerIntimated: 8 * k,
  uploadedInTool: 7 * k, pendingDeliveryFiles: 4 * k, notIntimated: 1, tasksWorked: 11 * k, tasksClosed: 9 * k, tasksPending: 6 * k,
});
const pcOutlet = (o, i) => ({
  outletId: o.outletId, outletName: o.outletName, dealerId: o.dealerId, dealerName: o.dealerName,
  classification: o.outletClassification, ...pcFigures(i + 1),
  gateRegister: [gateDay(today, i ? 'ANSWER_PENDING' : 'DONE', i), gateDay(yesterday, 'MISSED', i + 1)],
});
const rowFigures = (k) => {
  const f = pcFigures(k); delete f.journeysTotal; delete f.gateRegisterMissed; delete f.notIntimated; delete f.tasksPending; return f;
};
function myWork() {
  const os = outlets.map(pcOutlet);
  const periods = [0, 1, 2, 3].map((n) => ({
    from: today, to: today, label: n === 0 ? 'Today' : `Day ${n}`,
    outlets: outlets.map((o, i) => ({ outletId: o.outletId, outletName: o.outletName, classification: o.outletClassification,
      ...rowFigures(i + 1), gateRegister: gateDay(today, 'DONE', i) })),
    totals: rowFigures(3),
  }));
  return { role: 'PC', from: today, to: today, by: 'day', outlets: os, totals: pcFigures(3), periods };
}

const shell = [
  ['*', /\/security\/v1\/auth\/(login|refresh|remember|resume)/, () => ({
    accessToken: 'mobile-layout-token', expiresAtUtc: '2099-01-01T00:00:00Z', actorType: 'USER', isSuperAdmin: false,
    sessionId: '11111111-1111-4111-8111-111111111111', deviceId: '22222222-2222-4222-8222-222222222222',
    remembered: true, rememberToken: null, rememberExpiresAtUtc: '2099-01-01T00:00:00Z',
  })],
  ['GET', /\/security\/v1\/status\/maintenance/, () => ({ maintenance: null })],
  ['GET', /\/security\/v1\/status\/app-version/, () => ({})],
  ['GET', /\/security\/v1\/me\/features/, () => ({ features: { AUDIT: true, ANALYTICS: true, CHECKOUT_GATE_REGISTER: false } })],
  ['GET', /\/security\/v1\/me\/announcements/, () => ({ announcement: null })],
  ['GET', /\/audit-core\/v1\/me\/projects/, (_m, _u, role) => ({ projects: [project(role)] })],
  ['GET', /\/p2\/v1\/tenants\/[^/]+\/my-work\/checkout-check/, () => ({ day: today, label: 'Yesterday', pending: [] })],
  ['GET', /\/p2\/v1\/tenants\/[^/]+\/my-work/, (_m, url, role) => (role === 'REVIEWER' ? reviewerMyWork(url) : myWork())],
];

// Screen groups first; shell entries last so specific screen fixtures win.
export const fixtures = [...journeys, ...journey360, ...documentsTasks, ...supervisory, ...shell];
export { TENANT, today, iso, outlets };
