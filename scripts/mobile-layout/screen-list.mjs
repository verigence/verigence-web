// Screens checked at phone widths. role: operating role in /v1/me/projects.
export const J = 'journey-mobile-1';
export const screens = [
  { name: 'pc-home', route: '/p2/home', role: 'PC' },
  { name: 'pc-tracker', route: '/p2/tracker', role: 'PC' },
  { name: 'pc-bookings', route: '/p2/bookings', role: 'PC' },
  { name: 'pc-journey-overview', route: `/p2/journeys/${J}/overview`, role: 'PC' },
  { name: 'pc-journey-documents', route: `/p2/journeys/${J}/documents`, role: 'PC' },
  { name: 'pc-new-booking', route: '/p2/journeys/new/documents', role: 'PC' },
  { name: 'pc-tasks', route: '/p2/tasks', role: 'PC' },
  { name: 'pc-journey-tasks', route: `/p2/journeys/${J}/tasks`, role: 'PC' },
  { name: 'pc-gate-pass', route: '/p2/gate-pass', role: 'PC' },
  { name: 'pc-missing-documents', route: '/p2/missing-documents', role: 'PC' },
  { name: 'pc-search', route: '/search', role: 'PC' },
  { name: 'pc-compliance-report', route: `/p2/journeys/${J}/compliance-report`, role: 'PC' },
  { name: 'tl-bookings', route: '/p2/bookings', role: 'TL' },
  { name: 'tl-tasks', route: '/p2/tasks', role: 'TL' },
  { name: 'tl-duplicates', route: '/p2/duplicate-bookings', role: 'TL' },
  { name: 'tl-discount-variance', route: '/p2/discount-variance', role: 'TL' },
  { name: 'tl-daily-report', route: '/p2/reports/daily', role: 'TL' },
  { name: 'tl-closures', route: '/p2/closures', role: 'TL' },
  { name: 'tl-journey-export', route: '/p2/reports/journey-export', role: 'TL' },
  { name: 'tl-utilisation', route: '/p2/reports/utilisation', role: 'TL' },
  { name: 'rv-review-board', route: '/p2/review', role: 'REVIEWER' },
  { name: 'rv-review-activity', route: '/p2/review/activity', role: 'REVIEWER' },
  { name: 'rv-home', route: '/p2/home', role: 'REVIEWER' },
];
screens.push(
  { name: 'pc-myhr-home', route: '/home', role: 'PC' },
  { name: 'pc-myhr-attendance', route: '/hr/attendance', role: 'PC' },
  { name: 'pc-myhr-leave', route: '/hr/leave', role: 'PC' },
  { name: 'tl-myhr-approvals', route: '/hr/approvals', role: 'TL' },
);
