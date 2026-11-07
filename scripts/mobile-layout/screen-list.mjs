// Screens checked at phone widths. role: operating role in /v1/me/projects.
export const J = 'journey-mobile-1';
export const screens = [
  { name: 'pc-home', route: '/p2/home', role: 'PC' },
  { name: 'pc-tracker', route: '/p2/tracker', role: 'PC' },
  { name: 'pc-bookings', route: '/p2/bookings', role: 'PC' },
  { name: 'pc-journey-overview', route: `/p2/journeys/${J}/overview`, role: 'PC' },
  { name: 'pc-journey-documents', route: `/p2/journeys/${J}/documents`, role: 'PC' },
  { name: 'pc-new-booking', route: '/p2/journeys/new/documents', role: 'PC' },
  { name: 'pc-document-review', route: `/p2/journeys/${J}/documents/doc-booking-form-1`, role: 'PC' },
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
  { name: 'rv-review-board', route: '/p2/review', role: 'REVIEWER' },
  { name: 'rv-review-activity', route: '/p2/review/activity', role: 'REVIEWER' },
  { name: 'rv-home', route: '/p2/home', role: 'REVIEWER' },
  // Journey 360 tabs (the page picks its tab from ?tab=; the default tab is Deal).
  { name: 'pc-journey-payments', route: `/p2/journeys/${J}/overview?tab=payments`, role: 'PC' },
  { name: 'pc-journey-customer', route: `/p2/journeys/${J}/overview?tab=customer`, role: 'PC' },
  { name: 'pc-journey-vehicle', route: `/p2/journeys/${J}/overview?tab=vehicle`, role: 'PC' },
  { name: 'pc-journey-audit-summary', route: `/p2/journeys/${J}/overview?tab=audit-summary`, role: 'PC' },
  { name: 'pc-journey-checks', route: `/p2/journeys/${J}/overview?tab=compliance`, role: 'PC' },
];
screens.push(
  { name: 'pc-myhr-home', route: '/home', role: 'PC' },
  { name: 'pc-myhr-attendance', route: '/hr/attendance', role: 'PC' },
  { name: 'pc-myhr-leave', route: '/hr/leave', role: 'PC' },
  { name: 'tl-myhr-approvals', route: '/hr/approvals', role: 'TL' },
);
// Supervisory screens: the states the default capture does not reach.
screens.push(
  { name: 'tl-duplicates-deleted', route: '/p2/duplicate-bookings?tab=deleted', role: 'TL' },
  { name: 'tl-discount-variance-unknown', route: '/p2/discount-variance?view=unknown', role: 'TL' },
  { name: 'tl-closures-decide', route: '/p2/closures', role: 'TL',
    act: async (page) => { await page.getByRole('button', { name: 'Decide' }).nth(3).click(); await page.waitForTimeout(300); } },
  { name: 'tl-journey-export-open', route: '/p2/reports/journey-export', role: 'TL',
    act: async (page) => { await page.getByRole('button', { name: 'Open', exact: true }).click(); await page.waitForTimeout(800); } },
  { name: 'tl-daily-report-pc-open', route: '/p2/reports/daily', role: 'TL',
    act: async (page) => { await page.locator('.p2dr-pc .p2dr-toggle').first().click(); await page.locator('.p2dr-pc .p2dr-toggle').last().click(); await page.waitForTimeout(300); } },
  { name: 'tl-gate-pass', route: '/p2/gate-pass', role: 'TL' },
  { name: 'pc-gate-pass-day', route: '/p2/gate-pass', role: 'PC',
    act: async (page) => {
      await page.getByRole('button', { name: 'Yes' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.locator('.p2gp-day input').nth(1).check();
      await page.waitForTimeout(300);
    } },
  { name: 'ex-utilisation', route: '/p2/reports/utilisation', role: 'EXECUTIVE' },
);
screens.push(
  { name: 'pc-search-results', route: '/search?q=Pradhan', role: 'PC' },
  { name: 'tl-search-results', route: '/search?q=BKG/OD', role: 'TL' },
);
