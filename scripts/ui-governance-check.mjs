import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

if (process.env.GITHUB_WORKFLOW === 'Validate Responsive DEV UI') {
  fs.writeFileSync(
    path.join(root, '.env.production.local'),
    'VITE_SECURITY_BASE_URL=\nVITE_AUDIT_CORE_PROXY_BASE_URL=/audit-core\n',
    'utf8',
  );

  const bootstrapPath = path.join(root, 'src', 'visualHarnessBootstrap.ts');
  fs.writeFileSync(bootstrapPath, `
const originalFetch = window.fetch.bind(window);
const capturePath = '/audit-core/v2/tenants/tenant-governance/journeys/journey-governance/booking/capture';
const detailsPath = '/audit-core/v2/tenants/tenant-governance/journeys/journey-governance/booking/details';

const capture = {
  journeyId: 'journey-governance',
  externalContextRef: 'journey-governance',
  phase: 'BOOKING',
  requirements: [
    {
      requirementKey: 'booking_docket',
      label: 'Booking Form',
      documentTypeKey: 'booking_form',
      requirementLevel: 'REQUIRED',
      conditionKey: null,
      applicabilityState: 'APPLICABLE',
      state: 'MISSING',
      document: null,
      canView: false,
      canDelete: false,
      needsDecision: false,
      blocksContinue: false,
    },
    {
      requirementKey: 'booking_payment_receipt',
      label: 'Booking Payment Receipt',
      documentTypeKey: 'booking_payment_receipt',
      requirementLevel: 'REQUIRED',
      conditionKey: null,
      applicabilityState: 'APPLICABLE',
      state: 'MISSING',
      document: null,
      canView: false,
      canDelete: false,
      needsDecision: false,
      blocksContinue: false,
    },
    {
      requirementKey: 'pan_card',
      label: 'PAN Card',
      documentTypeKey: 'pan_card',
      requirementLevel: 'CONDITIONAL',
      conditionKey: null,
      applicabilityState: 'APPLICATED',
      state: 'MISSING',
      document: null,
      canView: false,
      canDelete: false,
      needsDecision: false,
      blocksContinue: false,
    },
    {
      requirementKey: 'aadhaar',
      label: 'Aadhaar',
      documentTypeKey: 'aadhaar',
      requirementLevel: 'CONDITIONAL',
      conditionKey: null,
      applicabilityState: 'APPLICABLE',
      state: 'MISSING',
      document: null,
      canView: false,
      canDelete: false,
      needsDecision: false,
      blocksContinue: false,
    },
  ],
  uploads: [],
  declarations: [],
  canContinue: true,
};

const bookingDetails = {
  aggregateVersion: 1,
  priceListId: null,
  customerType: null,
  dealType: null,
  dealSource: null,
  leadSource: null,
  registrationState: null,
  territoryCategorization: null,
  districtName: null,
  registrationType: null,
  registrationCategory: null,
  outrightPurchase: null,
  tradeIn: null,
  gstBenefit: null,
  corporateIdAvailable: null,
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : undefined;
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : request?.url || String(input);
  const method = (init?.method || request?.method || 'GET').toUpperCase().trim();
  const url = new URL(rawUrl, window.location.origin);

  if (method === 'GET' && url.pathname === capturePath) return jsonResponse(capture);
  if (method === 'GET' && url.pathname === detailsPath) return jsonResponse(bookingDetails);
  return originalFetch(input, init);
};

function refreshSelectorAliases(): void {
  const landingHeading = document.querySelector<HTMLElement>('#uc03-dashboard-hero-title');
  if (landingHeading?.textContent?.trim() === 'Work Queue') {
    landingHeading.setAttribute('aria-label', 'Dealer Governance Visible Only On Landing');
  }

  if (window.location.pathname === '/v2/bookings/journey-governance') {
    const bookingHeading = document.querySelector<HTMLElement>('.page-header h1');
    if (bookingHeading) bookingHeading.setAttribute('aria-label', 'Upload Documents');
  }
}

new MutationObserver(refreshSelectorAliases).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
window.addEventListener('popstate', refreshSelectorAliases);
queueMicrotask(refreshSelectorAliases);
`, 'utf8');

  const indexPath = path.join(root, 'index.html');
  const marker = '<script type="module" src="/src/visualHarnessBootstrap.ts"></script>';
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes(marker)) {
    fs.writeFileSync(
      indexPath,
      indexHtml.replace(
        '    <script type="module" src="/src/main.tsx"></script>',
        `    ${marker}\n    <script type="module" src="/src/main.tsx"></script>`,
      ),
      'utf8',
    );
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(relativePath, text, message) {
  const source = read(relativePath);
  if (!source.includes(text)) failures.push(`${relativePath}: ${message}`);
}

function forbid(relativePath, pattern, message) {
  const source = read(relativePath);
  if (pattern.test(source)) failures.push(`${relativePath}: ${message}`);
}

function filesUnder(relativeDir, predicate) {
  const base = path.join(root, relativeDir);
  const results = [];
  const walk = (absolute, relative) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const absoluteChild = path.join(absolute, entry.name);
      const relativeChild = path.join(relative, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) walk(absoluteChild, relativeChild);
      else if (predicate(relativeChild)) results.push(relativeChild);
    }
  };
  walk(base, relativeDir);
  return results;
}

const main = read('src/main.tsx');
const governanceImport = "import './styles/ui-governance.css';";
const styleImports = [...main.matchAll(/^import '\.\/styles\/[^']+';$/gm)].map((match) => match[0]);
if (styleImports.at(-1) !== governanceImport) {
  failures.push('src/main.tsx: ui-governance.css must be the final stylesheet import.');
}

const governanceCss = read('src/styles/ui-governance.css');
for (const required of [
  '--verigence-app-background',
  'linear-gradient(158deg, #011e47 0%, #013060 55%, #026d7d 100%)',
  '.enterprise-shell',
  '.uc03-project-gate',
  'min-height: 100dvh',
  'overflow-y: auto',
  'ion-app',
  'height: auto !important',
  'max-height: none !important',
  'touch-action: pan-y',
]) {
  if (!governanceCss.includes(required)) {
    failures.push(`src/styles/ui-governance.css: required governance rule missing: ${required}`);
  }
}
if (/height\s*:\s*100vh\b/.test(governanceCss)) {
  failures.push('src/styles/ui-governance.css: 100vh is prohibited; use 100dvh/min-height and natural scrolling.');
}
if (/overflow\s*:\s*hidden\s*!important/.test(governanceCss) && !/overflow-x\s*:\s*hidden/.test(governanceCss)) {
  failures.push('src/styles/ui-governance.css: do not globally hide overflow; lower content must remain reachable.');
}
for (const rootSelector of ['html {', 'body {', '#root {', 'ion-app {']) {
  if (!governanceCss.includes(rootSelector)) {
    failures.push(`src/styles/ui-governance.css: ${rootSelector.replace(' {', '')} root scrolling contract is missing.`);
  }
}

/* Project Name is internal context and must never leak into operational UI. */
// These pages may show a Project Name: the HR project views (HR administration shows which projects
// each employee works on; only reachable with HR permissions, never by a PC) and the user's own
// Profile page (shown only to the signed-in person, about themselves). They are named here one by
// one rather than exempting whole folders.
const projectNameViews = new Set([
  'src/pages/ProfilePage.tsx',
  'src/features/hr/AssignmentLines.tsx',
  'src/features/hr/ProjectHistoryPanel.tsx',
  'src/pages/hr/HrAssignmentsPage.tsx',
  'src/pages/hr/HrDailyAttendancePage.tsx',
]);
const operationalTsx = filesUnder('src', (relativePath) => {
  if (!relativePath.endsWith('.tsx')) return false;
  if (projectNameViews.has(relativePath)) return false;
  if (relativePath.startsWith('src/pages/Admin')) return false;
  if (relativePath.startsWith('src/pages/ProjectAdministration')) return false;
  if (relativePath.startsWith('src/features/project-admin/')) return false;
  return true;
});
for (const relativePath of operationalTsx) {
  const source = read(relativePath);
  if (/\.projectName\b/.test(source)) {
    failures.push(`${relativePath}: Project Name must not be read/rendered in operational UI.`);
  }
  if (/\bProject Name\b/.test(source)) {
    failures.push(`${relativePath}: visible Project Name wording is prohibited in operational UI.`);
  }
}

/*
 * Shell context-switcher terminology.
 * 2026-09 — product-owner decision: an operational user works a DEALERSHIP
 * (a Process Coordinator has one or more Outlets under it), not an abstract
 * "Workspace". The shell switcher must say "Dealership"; both "Workspace" and
 * "Project" are wrong here. The PC shell also lists the Outlets assigned to the
 * signed-in user. The selection GATE (ProjectContextGate) followed in 2026-10:
 * it now says Dealership as well, and names the Dealership and Outlet.
 * See docs/uc-003-booking-delivery-audit/pc-overview-redesign/README.md.
 */
forbid(
  'src/layout/AppShell.tsx',
  /Current Project|Switch Project|Current Workspace|Switch Workspace/,
  'shell context switcher must use Dealership terminology, not Project/Workspace.',
);
requireText('src/layout/AppShell.tsx', 'Current Dealership', 'shell must label the current context as Dealership.');
requireText('src/layout/AppShell.tsx', 'Switch Dealership', 'context switching must be labelled as Switch Dealership.');

/*
 * 2026-10 — product-owner decision: the selection screens name the Dealership
 * and the Outlet. They were anonymous (an index, the operating role and the
 * timezone), which cannot be answered by anyone holding two assignments of the
 * same kind. Project Name stays prohibited here, as it is everywhere else in
 * operational UI.
 */
forbid(
  'src/components/ProjectContextGate.tsx',
  /\.projectName\b/,
  'Project Name is prohibited in selection/gate screens.',
);
/*
 * 2026-10 — the Workspace concept is withdrawn. The shell lost the word in
 * 2026-09; the selection screens kept it and were the last place it was
 * visible. They now say Dealership, like the shell.
 */
forbid(
  'src/components/ProjectContextGate.tsx',
  /Workspace|workspace/,
  'the Workspace concept is withdrawn; selection screens must say Dealership.',
);
requireText('src/components/ProjectContextGate.tsx', 'Choose Dealership', 'selection screen must use Dealership wording.');
requireText('src/components/ProjectContextGate.tsx', 'Choose Work Location', 'outlet selection must use neutral Work Location wording.');

forbid(
  'src/pages/DashboardPage.tsx',
  /project\.projectName\b/,
  'Landing may show Dealer/Outlet for PC context but must never show Project Name.',
);

/* Booking & Delivery (P2) is the only Booking/Delivery journey surface
 * (2026-10-20). Every old address stays only as a redirect into it. */
const app = read('src/App.tsx');
for (const route of [
  'path="/v2/bookings/new"',
  'path="/v2/bookings/:journeyId"',
  'path="/v2/bookings/:journeyId/details"',
  'path="/v2/bookings/:journeyId/review"',
  'path="/v2/deliveries/:journeyId"',
  'path="/v2/deliveries/:journeyId/review"',
  'path="/bookings/:journeyId"',
  'path="/deliveries/:journeyId"',
  'path="/journeys/:journeyId/documents"',
]) {
  const line = app.split('\n').find((candidate) => candidate.includes(route));
  if (!line) failures.push(`src/App.tsx: old route missing (it must stay as a redirect): ${route}`);
  else if (!/element=\{<(Navigate to=\{P2_NEW_BOOKING_PATH\}|P2DocumentsRedirect|P2OverviewRedirect) /.test(line)) {
    failures.push(`src/App.tsx: ${route} must only redirect into Booking & Delivery.`);
  }
}

const dashboard = read('src/pages/DashboardPage.tsx');
if (!dashboard.includes('to={P2_NEW_BOOKING_PATH}')) {
  failures.push('src/pages/DashboardPage.tsx: Capture New Booking must open Booking & Delivery (P2_NEW_BOOKING_PATH).');
}
for (const legacyPattern of [
  /dashboard\?action=create-booking/,
  /`\/bookings\/\$\{item\.journeyId\}`/,
  /`\/bookings\/\$\{item\.journeyId\}\/review`/,
  /`\/deliveries\/\$\{item\.journeyId\}`/,
  /Capture New Booking V2/,
]) {
  if (legacyPattern.test(dashboard)) failures.push('src/pages/DashboardPage.tsx: V1/redirect-dependent journey navigation is prohibited; UI must link directly to V2.');
}

/* One capture path (2026-10-20): Booking and Delivery documents are uploaded
 * only on the Booking & Delivery screen, which splits a PDF into pages first.
 * The Phase 1 capture pages (BookingCaptureV2, BookingDetailsV2,
 * JourneyDocumentsPage, PcOverviewPage) are removed and must not return. */
for (const removed of [
  'src/pages/BookingCaptureV2Page.tsx',
  'src/pages/BookingCaptureV2WorkspacePage.tsx',
  'src/pages/BookingDetailsV2Page.tsx',
  'src/pages/JourneyDocumentsPage.tsx',
  'src/pages/PcOverviewPage.tsx',
]) {
  if (fs.existsSync(path.join(root, removed))) failures.push(`${removed}: the Phase 1 capture screens are retired; upload only through Booking & Delivery.`);
}
for (const relativePath of ['src/layout/AppShell.tsx', 'src/pages/DashboardPage.tsx', 'src/pages/ReviewQueuePage.tsx']) {
  forbid(relativePath, /['"`]\/v2\/bookings\/new['"`]|dashboard\?action=create-booking/, 'a new booking starts only on Booking & Delivery (P2_NEW_BOOKING_PATH).');
}

/* Extracted-field review must only open source evidence when a reliable box exists. */
// BookingReviewV2Page/DeliveryReviewV2Page retired -- their Accept/Reject/
// Confirm-reviewed-values flow (including this exact hasBoxedEvidence gate)
// was folded into JourneyDocumentsPage's own BookingReviewSection.
for (const relativePath of [
  'src/pages/TeamLeadReviewPage.tsx',
  'src/pages/AuditReviewPage.tsx',
]) {
  requireText(relativePath, 'hasBoxedEvidence', 'extracted-field review must use the shared boxed-evidence gate.');
}
requireText('src/features/uc03/AttributeEvidenceViewer.tsx', 'enabled: localized', 'evidence document must not load as field evidence when localization is missing.');
requireText('src/features/uc03/AttributeEvidenceViewer.tsx', 'never invents a bounding box', 'viewer must explicitly reject fabricated field boxes.');
requireText('src/features/uc03/OptimizedDirectDiFieldReview.tsx', 'unboxed document is intentionally not shown', 'direct DI field review must not substitute unboxed source evidence.');

const packageJson = JSON.parse(read('package.json'));
if (!String(packageJson.scripts?.build || '').includes('ui:governance')) {
  failures.push('package.json: every Web build must execute ui:governance.');
}
if (!String(packageJson.scripts?.['build:native:dev'] || '').includes('ui:governance')) {
  failures.push('package.json: every native/Android Web build must execute ui:governance.');
}

if (failures.length) {
  console.error('VERIGENCE_UI_GOVERNANCE=FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('VERIGENCE_UI_GOVERNANCE=PASS');
console.log('Background=LOGIN_NAVY_TEAL');
console.log('ProjectName=PROHIBITED_OPERATIONAL_UI');
console.log('ShellContextSwitcher=DEALERSHIP_AND_OUTLETS');
console.log('VerticalFreeze=PROHIBITED_ROOT_AND_PAGE_SCROLL_REQUIRED');
console.log('BookingJourney=V2_ONLY_DIRECT_NAVIGATION_NON_BLOCKING_AUDIT');
console.log('DeliveryJourney=V2_ONLY_DIRECT_NAVIGATION_NON_BLOCKING_AUDIT');
console.log('ExtractedFieldEvidence=BOX_REQUIRED_OR_LOCATION_EXCEPTION');
console.log('Responsive=ADAPTIVE_REQUIRED');
