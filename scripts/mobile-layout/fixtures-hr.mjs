// Mock API responses for the mobile layout harness: myHR screens. Same tuple shape as fixtures.mjs.
// My attendance (/hr/attendance), My leave (/hr/leave) and Approvals (/hr/approvals, as a TL).
// Shapes follow src/services/hr/attendance.ts (AttendanceToday, AttendanceMonth), attendanceCalendar.ts
// (AttendanceCalendar, Correction, CorrectionApproval), leave.ts (LeaveBalance, LeaveEarning,
// LeaveRequest, LeaveAbsences, HolidayList, RecentLeave) and approvals.ts (AttendanceApproval,
// LeaveApproval, ClaimApproval, ClaimDetail).
// The signed-in employee is the one mocked in fixtures-journeys.mjs (/hr/v1/me/employee).
import { today, iso, outlets } from './fixtures-base.mjs';

const [o1, o2] = outlets;
const PROJECT = 'Mahindra Orissa';
const ADDRESS = {
  [o1.outletName]: 'NH-16 Service Road, Tamando, Bhubaneswar, Khordha, Odisha 751028',
  [o2.outletName]: 'Plot 452, KIIT Road, Patia, Bhubaneswar, Khordha, Odisha 751024',
};
const TIMES = { checkIn: '09:30', lateAfter: '09:45', checkOutEarliest: '18:00', checkOut: '18:30', absentAfter: '17:00', minimumHours: 5 };
// Declared Odisha holidays (company-wide). Sundays are off by default.
const HOLIDAYS = { '2026-10-20': 'Vijaya Dashami', '2026-10-26': 'Kumar Purnima', '2026-11-24': 'Rasa Purnima' };

// ── dates ──────────────────────────────────────────────────────────────────────────────────────
const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const isSunday = (day) => weekday(day) === 0;
const isOff = (day) => isSunday(day) || Boolean(HOLIDAYS[day]);
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const nowHhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
/** Working days before today, newest first. */
const wd = [];
for (let d = addDays(today, -1); wd.length < 45; d = addDays(d, -1)) if (!isOff(d)) wd.push(d);
/** Working days after today, nearest first. */
const fwd = [];
for (let d = addDays(today, 1); fwd.length < 12; d = addDays(d, 1)) if (!isOff(d)) fwd.push(d);
/** The Sunday the employee worked (approved): the comp-off was earned there. */
const workedSunday = (() => { let d = wd[9]; while (!isSunday(d)) d = addDays(d, -1); return d; })();
const at = (day, hhmm) => iso(day, `${hhmm}:00`);
/** "25 Oct", as a person writes a date in a reason. */
const spoken = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ── the signed-in PC's days ────────────────────────────────────────────────────────────────────
const exc = (day, event, kind, status, reason, decisionNote = null) => ({
  exceptionId: `exc-${day}-${kind.toLowerCase()}`, event, kind, reason, status, decisionNote,
  decidedAt: status === 'PENDING' ? null : at(addDays(day, 1), '10:20'),
});
const worked = (inAt, outAt, extra = {}) => ({ status: 'PRESENT', inAt, outAt, outlet: o1.outletName, distIn: 31, distOut: 44, exceptions: [], ...extra });

/** What each day was. Days not listed: a present working day, an off day, or upcoming. */
const plan = {
  [wd[0]]: worked('09:24', '17:20', { outlet: o2.outletName, distIn: 18, distOut: 22 }),
  [wd[1]]: { status: 'LEAVE_APPLIED', leave: { requestId: 'lv-r1', leaveType: 'PAID', halfDay: false, status: 'PENDING' } },
  [wd[2]]: {
    status: 'ABSENT', markedBySystem: true,
    correction: { correctionId: 'cr-1', requested: 'FULL_DAY', status: 'PENDING',
      reason: 'I was at the Patia satellite showroom from 9:40 am for two deliveries, but the app could not get a GPS fix inside the basement stockyard, so check-in did not go through. I told my TL on WhatsApp at 10:05 am.' },
  },
  [wd[3]]: worked('10:12', '18:40', { status: 'HALF_DAY', exceptions: [] }),
  [wd[4]]: worked('09:26', '18:38', { distIn: 1240 }),
  [wd[5]]: { status: 'LEAVE_APPROVED', leave: { requestId: 'lv-r3', leaveType: 'COMP_OFF', halfDay: false, status: 'APPROVED' } },
  [wd[6]]: worked('09:31', '18:35'),
  [wd[7]]: worked('09:19', '18:44', { outlet: o2.outletName, distIn: 26, distOut: 19 }),
  [wd[8]]: { ...worked('09:35', null), status: 'CORRECTED',
    correction: { correctionId: 'cr-2', requested: 'FULL_DAY', status: 'APPROVED',
      reason: 'Forgot to check out after the evening delivery of the Scorpio-N Z8; left the outlet at 7:10 pm.' } },
  [wd[18]]: { status: 'ABSENT', markedBySystem: true },
  [wd[25]]: { ...worked('09:30', '13:42'), leave: { requestId: 'lv-r7', leaveType: 'UNPAID', halfDay: true, status: 'APPROVED' } },
  [wd[30]]: { status: 'LEAVE_APPROVED', leave: { requestId: 'lv-r8', leaveType: 'PAID', halfDay: false, status: 'APPROVED' } },
  [wd[31]]: { status: 'LEAVE_APPROVED', leave: { requestId: 'lv-r8', leaveType: 'PAID', halfDay: false, status: 'APPROVED' } },
  [workedSunday]: worked('10:05', '16:40', { status: 'OFF_DAY_WORKED' }),
  [fwd[1]]: { status: 'LEAVE_APPROVED', leave: { requestId: 'lv-r4', leaveType: 'PAID', halfDay: false, status: 'APPROVED' } },
  [fwd[2]]: { status: 'LEAVE_APPROVED', leave: { requestId: 'lv-r4', leaveType: 'PAID', halfDay: false, status: 'APPROVED' } },
  [fwd[5]]: { status: 'LEAVE_APPLIED', leave: { requestId: 'lv-r2', leaveType: 'PAID', halfDay: true, status: 'PENDING' } },
};
// Exceptions (full shape for the history; the calendar keeps kind and status).
plan[wd[3]].exceptions = [exc(wd[3], 'CHECK_IN', 'LATE_CHECK_IN', 'REJECTED',
  'Overslept after the late Dhanteras delivery the night before.',
  'Second late check-in this month and no call before 9:45 am. Marked as a half day.')];
plan[wd[3]].flagsIn = ['LATE'];
plan[wd[0]].exceptions = [exc(wd[0], 'CHECK_OUT', 'EARLY_CHECK_OUT', 'APPROVED',
  'Left early to submit the RTO registration papers of three deliveries at the Bhubaneswar RTO before it closed.', 'Okay, RTO work.')];
plan[wd[0]].flagsOut = ['EARLY'];
plan[wd[4]].exceptions = [exc(wd[4], 'CHECK_IN', 'OUT_OF_FENCE', 'APPROVED',
  'Checked in from the Mahindra stock yard at Rasulgarh for the in-transit vehicle verification asked by the GM.', 'Yard visit confirmed by GM Sales.')];
plan[wd[4]].flagsIn = ['OUT_OF_FENCE'];
plan[workedSunday].exceptions = [exc(workedSunday, 'CHECK_IN', 'OFF_DAY_WORK', 'APPROVED',
  'Sunday delivery rush: six festive deliveries booked for the day at Tamando.', 'Approved. Comp-off credited.')];
plan[workedSunday].flagsIn = ['OFF_DAY'];

// Today: a late check-in waiting for the TL; checked out once it is past 18:50 IST.
const checkedOutToday = nowHhmm >= '18:50';
const todayPlan = {
  ...worked('09:58', checkedOutToday ? '18:47' : null),
  status: checkedOutToday ? 'PENDING_APPROVAL' : 'CHECKED_IN',
  flagsIn: ['LATE'],
  exceptions: [exc(today, 'CHECK_IN', 'LATE_CHECK_IN', 'PENDING',
    'The 8:40 am Mo Bus from Cuttack was held up in the Rasulgarh square jam for 25 minutes; reached the Tamando outlet at 9:55 am.')],
};
if (!isOff(today)) plan[today] = todayPlan;

function calendarDay(date, month) {
  const p = plan[date];
  const dayKind = isSunday(date) ? 'SUNDAY' : HOLIDAYS[date] ? 'HOLIDAY' : 'WORKING';
  let status;
  if (p) status = p.status;
  else if (date > today) status = dayKind === 'WORKING' ? 'UPCOMING' : 'OFF_DAY';
  else status = dayKind === 'WORKING' ? 'PRESENT' : 'OFF_DAY';
  // An unlisted past working day: present, with times that vary a little.
  const n = Number(date.slice(8, 10));
  const spec = p ?? (status === 'PRESENT' ? worked(`09:${String(17 + (n * 7) % 26).padStart(2, '0')}`, `18:${String(31 + (n * 11) % 28).padStart(2, '0')}`) : {});
  const inAt = spec.inAt ? at(date, spec.inAt) : null;
  const outAt = spec.outAt ? at(date, spec.outAt) : null;
  const minutes = spec.inAt && spec.outAt ? minutesOf(spec.outAt) - minutesOf(spec.inAt) : 0;
  const running = date === today && spec.inAt && !spec.outAt ? Math.max(0, minutesOf(nowHhmm) - minutesOf(spec.inAt)) : null;
  return {
    date, status, label: date, dayKind, holiday: HOLIDAYS[date] ?? null, halfDayHoliday: null, workingSunday: null,
    checkInAt: inAt, checkOutAt: outAt, minutes, runningMinutes: running,
    leave: spec.leave ?? null, correction: spec.correction ?? null,
    exceptions: (spec.exceptions ?? []).map((e) => ({ kind: e.kind, status: e.status })),
    markedBySystem: Boolean(spec.markedBySystem), inMonth: date.slice(0, 7) === month,
    _spec: spec,
  };
}
const strip = ({ _spec, ...day }) => day; // eslint-disable-line no-unused-vars

function monthOf(url) {
  const m = url.searchParams.get('month');
  return /^\d{4}-\d{2}$/.test(m ?? '') ? m : today.slice(0, 7);
}

function calendar(url) {
  const month = monthOf(url);
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  let start = first;
  while (weekday(start) !== 1) start = addDays(start, -1);
  const weeks = [];
  const counts = {};
  let monthMinutes = 0;
  let monthWorked = 0;
  for (let ws = start; ws <= last; ws = addDays(ws, 7)) {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => calendarDay(addDays(ws, i), month));
    for (const d of days) {
      if (!d.inMonth || d.date > today) continue;
      counts[d.status] = (counts[d.status] ?? 0) + 1;
      monthMinutes += d.minutes;
      if (d.minutes > 0) monthWorked += 1;
    }
    weeks.push({
      weekStart: ws, weekEnd: addDays(ws, 6),
      minutes: days.reduce((s, d) => s + d.minutes, 0), daysWorked: days.filter((d) => d.minutes > 0).length,
      days: days.map(strip),
    });
  }
  return {
    month, absentAfter: TIMES.absentAfter, minimumHours: TIMES.minimumHours,
    totals: { minutes: monthMinutes, daysWorked: monthWorked, statusCounts: counts }, weeks,
  };
}

const side = (date, spec, event) => {
  const hhmm = event === 'CHECK_IN' ? spec.inAt : spec.outAt;
  if (!hhmm) return null;
  return {
    at: at(date, hhmm), distanceM: event === 'CHECK_IN' ? spec.distIn : spec.distOut,
    outletName: spec.outlet, address: ADDRESS[spec.outlet] ?? null,
    flags: (event === 'CHECK_IN' ? spec.flagsIn : spec.flagsOut) ?? [], hasPhoto: true,
  };
};
const dayStatus = { PRESENT: 'COMPLETE', CORRECTED: 'COMPLETE', OFF_DAY_WORKED: 'COMPLETE', HALF_DAY: 'EXCEPTION_REJECTED', PENDING_APPROVAL: 'PENDING_APPROVAL', CHECKED_IN: 'CHECKED_IN' };
function attendanceDay(d) {
  return {
    attendanceId: `att-${d.date}`, workDate: d.date, status: dayStatus[d.status] ?? 'COMPLETE', geofenced: true,
    checkIn: side(d.date, d._spec, 'CHECK_IN'), checkOut: side(d.date, d._spec, 'CHECK_OUT'), exceptions: d._spec.exceptions ?? [],
  };
}

function myMonth(url) {
  const month = monthOf(url);
  const days = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month && d <= today; d = addDays(d, 1)) {
    const c = calendarDay(d, month);
    if (c.checkInAt) days.push(attendanceDay(c));
  }
  return { month, days: days.reverse() };
}

function attendanceToday() {
  const off = isOff(today);
  const c = calendarDay(today, today.slice(0, 7));
  return {
    workDate: today, serverTime: new Date().toISOString(),
    dayKind: isSunday(today) ? 'SUNDAY' : HOLIDAYS[today] ? 'HOLIDAY' : 'WORKING', holidayName: HOLIDAYS[today] ?? null,
    halfDayHoliday: null, workingSunday: null, tentativeHoliday: null, tentativeHolidayDayPart: null,
    day: off ? null : attendanceDay(c),
    roles: ['PC'], geofenced: true, geofenceRadiusM: 500,
    outlets: [
      { outletName: o1.outletName, projectName: PROJECT, hasLocation: true },
      { outletName: o2.outletName, projectName: PROJECT, hasLocation: true },
    ],
    workContextAgeHours: 6, standardTimes: TIMES,
  };
}

const myCorrections = [
  { correctionId: 'cr-1', workDate: wd[2], requested: 'FULL_DAY', reason: plan[wd[2]].correction.reason, status: 'PENDING',
    decisionNote: null, decidedAt: null, createdAt: at(wd[1], '20:14') },
  { correctionId: 'cr-2', workDate: wd[8], requested: 'FULL_DAY', reason: plan[wd[8]].correction.reason, status: 'APPROVED',
    decisionNote: 'Confirmed with the outlet gate register: last delivery left at 7:02 pm.', decidedAt: at(wd[6], '11:05'), createdAt: at(wd[7], '09:40') },
  { correctionId: 'cr-3', workDate: wd[18], requested: 'HALF_DAY',
    reason: 'Was at the Khurda Road RTO for the Thar Roxx registration till 2 pm and reached the outlet after the system had marked me absent.',
    status: 'REJECTED', decisionNote: 'No call or message to me that day and the RTO receipt shows 11:20 am. Apply leave for the day instead.',
    decidedAt: at(wd[16], '17:45'), createdAt: at(wd[17], '10:02') },
];

// ── leave ──────────────────────────────────────────────────────────────────────────────────────
// Born 18 Apr (fixtures-journeys.mjs employee.dateOfBirth).
const birthdayYear = today.slice(5) >= '04-18' ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
const leaveBalance = (url) => ({
  year: Number(url.searchParams.get('year')) || Number(today.slice(0, 4)),
  types: [
    { leaveType: 'PAID', granted: 7, used: 4, pending: 1.5, balance: 3, available: 1.5 },
    { leaveType: 'SPECIAL', granted: 1, used: 0, pending: 0, balance: 1, available: 1 },
    { leaveType: 'COMP_OFF', granted: 1.5, used: 1, pending: 0, balance: 0.5, available: 0.5 },
  ],
  birthdayLeave: {
    dateOfBirthOnFile: true, open: true, birthdayYear,
    availableFrom: `${birthdayYear}-04-18`, availableUntil: `${birthdayYear + 1}-04-17`, nextOpensOn: `${birthdayYear + 1}-04-18`,
  },
});

const leaveEarning = {
  attendanceDaysNeeded: 22, paidDaysEarned: 1, balanceCap: 3, attendanceDaysSoFar: 14.5, countPausedFrom: plan[today] ? today : null,
  blocks: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
    blockNo: 8 - k, completedOn: addDays(today, -(11 + k * 30)), attendanceDays: 22,
    credited: k === 2 ? 0 : 1, lapsed: k === 2 ? 1 : 0,
  })),
};

const req = (id, leaveType, fromDate, toDate, days, status, reason, extra = {}) => ({
  requestId: id, leaveType, fromDate, toDate, halfDay: false, days, reason, occasion: null, status,
  approverRule: 'TL_PM', decidedAt: null, decisionNote: null, ...extra,
});
const leaveRequests = [
  req('lv-r2', 'PAID', fwd[5], fwd[5], 0.5, 'PENDING',
    'Half day for my younger sister’s college admission counselling at Ravenshaw University, Cuttack.',
    { halfDay: true, submittedAt: at(today, '12:31') }),
  req('lv-r1', 'PAID', wd[1], wd[1], 1, 'PENDING',
    'Mother was admitted to Capital Hospital, Bhubaneswar overnight with high fever; I stayed with her through the day. Discharge summary can be shared.',
    { submittedAt: at(wd[0], '21:08') }),
  req('lv-r4', 'PAID', fwd[1], fwd[2], 2, 'APPROVED',
    'Travelling to Baripada for my grandfather’s annual shraddha ceremony.',
    { submittedAt: at(wd[9], '18:55'), decidedAt: at(wd[8], '10:12'), decisionNote: 'Approved. Hand over the pending delivery files to Priyadarshini before you leave.' }),
  req('lv-r3', 'COMP_OFF', wd[5], wd[5], 1, 'APPROVED',
    `Comp-off for the Sunday worked on ${spoken(workedSunday)} (festive deliveries at Tamando).`,
    { submittedAt: at(wd[11], '19:02'), decidedAt: at(wd[10], '09:48') }),
  req('lv-r6', 'SPECIAL', wd[10], wd[10], 1, 'CANCELLED', null,
    { occasion: 'Birthday', submittedAt: at(wd[14], '16:20') }),
  req('lv-r5', 'PAID', wd[16], wd[15], 2, 'REJECTED',
    'Cousin’s wedding at Puri; need to travel the evening before.',
    { submittedAt: at(wd[22], '13:15'), decidedAt: at(wd[20], '10:30'),
      decisionNote: 'Month-end deliveries at Tamando and you are the only PC on the floor that week. Please re-apply for a date after the 20th.' }),
  req('lv-r7', 'UNPAID', wd[25], wd[25], 0.5, 'APPROVED',
    'Afternoon off to complete my passport police verification at Mancheswar police station.',
    { halfDay: true, submittedAt: at(wd[27], '11:40'), decidedAt: at(wd[26], '15:05') }),
  req('lv-r8', 'PAID', wd[31], wd[30], 2, 'APPROVED',
    'Family trip to Konark and Chandrabhaga for my parents’ 30th wedding anniversary.',
    { submittedAt: at(wd[38], '17:30'), decidedAt: at(wd[37], '09:58') }),
];

const holidays = (url) => {
  const year = Number(url.searchParams.get('year')) || Number(today.slice(0, 4));
  return {
    items: Object.entries(HOLIDAYS).filter(([d]) => d.startsWith(String(year)))
      .map(([date, name]) => ({ date, name, status: 'DECLARED', dayPart: 'FULL_DAY' }))
      .concat([{ date: `${year}-12-25`, name: 'Christmas', status: 'TENTATIVE', dayPart: 'FULL_DAY' }]),
    note: 'Holidays declared for Mahindra Orissa and your outlets. Tentative holidays are counted as working days until HR declares them.',
  };
};

const recentLeave = (fromDate, paidDays, unpaidDays) => ({ windowFrom: addDays(fromDate, -42), windowTo: addDays(fromDate, -1), paidDays, unpaidDays });

// ── approvals inbox (Team Lead) ────────────────────────────────────────────────────────────────
const TEAM = {
  subhashree: { employeeId: 'emp-od-0157', employeeCode: 'VG-OD-0157', employeeName: 'Subhashree Mohapatra Das' },
  bibhuti: { employeeId: 'emp-od-0163', employeeCode: 'VG-OD-0163', employeeName: 'Bibhuti Bhushan Pradhan' },
  lipsa: { employeeId: 'emp-od-0171', employeeCode: 'VG-OD-0171', employeeName: 'Lipsa Priyadarshini Jena' },
  debasish: { employeeId: 'emp-od-0128', employeeCode: 'VG-OD-0128', employeeName: 'Debasish Kumar Swain' },
  sasmita: { employeeId: 'emp-od-0149', employeeCode: 'VG-OD-0149', employeeName: 'Sasmita Rani Pattanaik' },
  rashmi: { employeeId: 'emp-od-0136', employeeCode: 'VG-OD-0136', employeeName: 'Rashmi Ranjan Behera' },
};

const attApproval = (who, workDate, event, kind, hhmm, extra = {}) => ({
  exceptionId: `ex-${who.employeeCode}-${workDate}-${kind}`, attendanceId: `att-${who.employeeCode}-${workDate}`,
  ...who, workDate, event, kind, reason: null, status: 'PENDING', decisionNote: null,
  at: at(workDate, hhmm), distanceM: 30, outletName: o1.outletName, grace: null, ...extra,
});
const attendanceApprovals = [
  attApproval(TEAM.subhashree, today, 'CHECK_IN', 'OUT_OF_FENCE', '09:41', {
    distanceM: 6400, outletName: o2.outletName,
    reason: 'The GM asked me to attend the Mahindra regional stock audit at the Rasulgarh yard this morning. I will move to the Patia showroom after 1 pm and check out from there.',
  }),
  attApproval(TEAM.bibhuti, wd[0], 'CHECK_IN', 'LATE_CHECK_IN', '10:22', {
    distanceM: 24, outletName: o2.outletName,
    reason: 'Scooty tyre punctured near Jagatpur bridge and the nearest repair shop opened only at 9:45 am.',
    grace: { allowed: 1, lateOrEarlyThisMonth: 2, thisIsNumber: 2, withinGrace: false },
  }),
  attApproval(TEAM.lipsa, wd[2], 'CHECK_OUT', 'EARLY_CHECK_OUT', '16:35', {
    distanceM: 12,
    reason: 'Daughter’s parent-teacher meeting at DAV Unit-8 at 5 pm. All delivery updates for the day were finished before I left.',
    grace: { allowed: 1, lateOrEarlyThisMonth: 1, thisIsNumber: 1, withinGrace: true },
  }),
  attApproval(TEAM.debasish, wd[3], 'CHECK_OUT', 'OUT_OF_FENCE', '19:12', {
    distanceM: 1850,
    reason: 'Checked out from the customer’s house at Nayapalli after the home delivery of the XUV 3XO; the showroom delivery bay was full that evening.',
  }),
  attApproval(TEAM.sasmita, wd[4], 'CHECK_IN', 'LATE_CHECK_IN', '09:57', {
    outletName: o1.outletName, grace: { allowed: 1, lateOrEarlyThisMonth: 1, thisIsNumber: 1, withinGrace: true },
  }),
  attApproval(TEAM.rashmi, workedSunday, 'CHECK_IN', 'OFF_DAY_WORK', '10:08', {
    reason: 'Sunday delivery rush: six festive deliveries were booked at Tamando and the outlet asked for a PC on the floor.',
  }),
];

const corrApproval = (who, id, workDate, requested, reason, day, createdDay) => ({
  correctionId: id, workDate, requested, reason, status: 'PENDING', decisionNote: null, decidedAt: null,
  createdAt: at(createdDay, '19:20'), ...who, day,
});
const correctionApprovals = [
  corrApproval(TEAM.bibhuti, 'cr-t1', wd[1], 'FULL_DAY',
    'Went straight to the Khurda Road RTO for the registration of four Bolero Neo deliveries and reached the outlet at 3 pm; the app had already marked me absent so check-in was refused.',
    { checkInAt: null, checkOutAt: null, exceptions: [] }, wd[0]),
  corrApproval(TEAM.lipsa, 'cr-t2', wd[3], 'HALF_DAY',
    'Forgot to check out after the evening delivery; I left the outlet at 6:45 pm. Gate register shows the vehicle out at 6:32 pm.',
    { checkInAt: at(wd[3], '09:27'), checkOutAt: null, exceptions: [] }, wd[2]),
  corrApproval(TEAM.rashmi, 'cr-t3', wd[5], 'FULL_DAY',
    'Late check-in was because of the Bhubaneswar–Cuttack road block for the VIP movement; I was on the bus from 8:30 am. Asking for the half day to be made full.',
    { checkInAt: at(wd[5], '11:05'), checkOutAt: at(wd[5], '18:41'), exceptions: [{ kind: 'LATE_CHECK_IN', status: 'REJECTED' }] }, wd[4]),
];

const leaveApproval = (who, id, leaveType, fromDate, toDate, days, reason, extra = {}) => ({
  requestId: id, leaveType, fromDate, toDate, halfDay: false, days, reason, occasion: null, status: 'PENDING',
  approverRule: 'TL_PM', submittedAt: at(wd[0], '18:10'), decidedAt: null, decisionNote: null, ...who,
  coverWarnings: [], recentLeave: recentLeave(fromDate, 0, 0), ...extra,
});
const leaveApprovals = [
  leaveApproval(TEAM.subhashree, 'lv-t1', 'PAID', fwd[3], fwd[4], 2,
    'Elder brother’s wedding at Kendrapara; I need to be home for the Mangan and the Barajatri on both days.', {
      balanceAvailable: 2, submittedAt: at(wd[3], '20:42'), recentLeave: recentLeave(fwd[3], 1, 0),
      coverWarnings: [{ outletName: o2.outletName, otherPcs: 0, dates: [fwd[3], fwd[4]] }],
    }),
  leaveApproval(TEAM.bibhuti, 'lv-t2', 'UNPAID', wd[0], wd[0], 0.5,
    'Took my father for his follow-up at SCB Medical College, Cuttack in the morning; came back to the outlet by 2 pm.', {
      halfDay: true, submittedAt: at(today, '09:15'), recentLeave: recentLeave(wd[0], 0, 1.5),
    }),
  leaveApproval(TEAM.lipsa, 'lv-t3', 'SPECIAL', fwd[6], fwd[6], 1, 'Family puja at home in Puri.', {
    occasion: 'Birthday', balanceAvailable: 1, submittedAt: at(wd[1], '13:05'), recentLeave: recentLeave(fwd[6], 0, 0),
    coverWarnings: [{ outletName: o1.outletName, otherPcs: 1, dates: [fwd[6]] }],
  }),
  leaveApproval(TEAM.rashmi, 'lv-t4', 'COMP_OFF', fwd[0], fwd[0], 1,
    `Comp-off for the Sunday worked on ${spoken(workedSunday)} for the festive deliveries.`, {
      balanceAvailable: 1, submittedAt: at(wd[0], '17:50'), recentLeave: recentLeave(fwd[0], 2, 0),
    }),
];

const month = today.slice(0, 7);
const claim = (who, id, category, categoryLabel, expenseDate, amount, extra = {}) => ({
  claimId: id, category, categoryLabel, expenseDate, amount, distanceKm: null, description: null, status: 'SUBMITTED',
  waitingFor: 'Team Lead or Project Manager', stage: 'TL_PM', stagePlan: ['TL_PM', 'HR'], stale: false,
  payrollMonth: month, payrollRunId: null, submittedAt: at(wd[0], '19:30'), ...who, monthTravelTotal: 0, ...extra,
});
const claimApprovals = [
  claim(TEAM.debasish, 'cl-t1', 'PERSONAL_BIKE', 'Personal bike', wd[1], 207, {
    distanceKm: 46, monthTravelTotal: 1240, submittedAt: at(wd[0], '21:12'),
    description: 'Tamando to the Khurda Road outlet and back for the stock-yard physical verification of 14 in-transit vehicles.',
  }),
  claim(TEAM.subhashree, 'cl-t2', 'CAR_TAXI', 'Car or taxi', wd[2], 1850, {
    stagePlan: ['TL_PM', 'HR', 'FINANCE'], monthTravelTotal: 3420, submittedAt: at(wd[1], '10:44'),
    description: 'Ola outstation cab from Bhubaneswar to the Cuttack Jagatpur satellite showroom for the month-end document audit; no bus back after 8 pm.',
  }),
  claim(TEAM.sasmita, 'cl-t3', 'MEALS', 'Meals', addDays(today, -74), 340, {
    stale: true, stagePlan: ['TL_PM', 'HR', 'FINANCE'], monthTravelTotal: 0, submittedAt: at(wd[4], '16:02'),
    description: 'Working dinner during the quarter-end stock reconciliation at the Patia showroom, which ran till 10:30 pm.',
  }),
];
const claimDetail = (id) => ({
  claimId: id,
  receipts: id === 'cl-t1' ? [] : [
    { receiptId: `${id}-r1`, name: id === 'cl-t2' ? 'Ola_invoice_CRN4419872.pdf' : 'Hotel_Swosti_bill_2231.jpg',
      contentType: id === 'cl-t2' ? 'application/pdf' : 'image/jpeg', sizeBytes: id === 'cl-t2' ? 184_320 : 1_240_000 },
  ],
});

const notAvailable = { __status: 404, body: { code: 'HR_NOT_FOUND', detail: 'This photo is not available.' } };

export const fixtures = [
  // My attendance
  ['GET', /\/hr\/v1\/attendance\/today(\?|$)/, () => attendanceToday()],
  ['GET', /\/hr\/v1\/attendance\/calendar\/me(\?|$)/, (_m, url) => calendar(url)],
  ['GET', /\/hr\/v1\/attendance\/corrections\/me(\?|$)/, () => ({ items: myCorrections })],
  ['GET', /\/hr\/v1\/attendance\/me(\?|$)/, (_m, url) => myMonth(url)],
  // Stamped photos are binary; the harness only serves JSON, so they answer "not available".
  ['GET', /\/hr\/v1\/attendance\/[^/]+\/photo\/(in|out)(\?|$)/, () => notAvailable],
  // My leave
  ['GET', /\/hr\/v1\/leave\/balance(\?|$)/, (_m, url) => leaveBalance(url)],
  ['GET', /\/hr\/v1\/leave\/earning(\?|$)/, () => leaveEarning],
  ['GET', /\/hr\/v1\/leave\/requests(\?|$)/, () => ({ items: leaveRequests })],
  ['GET', /\/hr\/v1\/leave\/absences(\?|$)/, () => ({ dates: [wd[2]] })],
  ['GET', /\/hr\/v1\/leave\/recent(\?|$)/, (_m, url) => recentLeave(url.searchParams.get('fromDate') || today, 1, 0.5)],
  ['GET', /\/hr\/v1\/holidays(\?|$)/, (_m, url) => holidays(url)],
  // Approvals inbox
  ['GET', /\/hr\/v1\/approvals\/attendance-corrections(\?|$)/, () => ({ items: correctionApprovals })],
  ['GET', /\/hr\/v1\/approvals\/attendance(\?|$)/, () => ({ items: attendanceApprovals })],
  ['GET', /\/hr\/v1\/approvals\/leave(\?|$)/, () => ({ items: leaveApprovals })],
  ['GET', /\/hr\/v1\/approvals\/claims(\?|$)/, () => ({ items: claimApprovals })],
  ['GET', /\/hr\/v1\/claims\/[^/]+\/receipts\/[^/?]+/, () => notAvailable],
  ['GET', /\/hr\/v1\/claims\/([^/?]+)(\?|$)/, (m) => claimDetail(decodeURIComponent(m[1]))],
];
