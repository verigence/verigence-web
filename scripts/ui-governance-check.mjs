import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

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
const operationalTsx = filesUnder('src', (relativePath) => {
  if (!relativePath.endsWith('.tsx')) return false;
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

forbid(
  'src/layout/AppShell.tsx',
  /Current Project|Switch Project/,
  'shared shell must use neutral Workspace terminology.',
);
requireText('src/layout/AppShell.tsx', 'Current Workspace', 'shared shell must use neutral Workspace context.');
requireText('src/layout/AppShell.tsx', 'Switch Workspace', 'project switching must be labelled as Workspace switching.');

forbid(
  'src/components/ProjectContextGate.tsx',
  /\.projectName\b|\.dealerName\b|\.outletName\b/,
  'Project/Dealer/Outlet names are prohibited in selection/gate screens.',
);
requireText('src/components/ProjectContextGate.tsx', 'Choose Workspace', 'selection screen must use neutral Workspace wording.');
requireText('src/components/ProjectContextGate.tsx', 'Choose Work Location', 'outlet selection must use neutral Work Location wording.');

forbid(
  'src/pages/DashboardPage.tsx',
  /project\.projectName\b/,
  'Landing may show Dealer/Outlet for PC context but must never show Project Name.',
);

/* V2 is the only active Booking/Delivery journey surface. */
const app = read('src/App.tsx');
for (const route of [
  'path="/v2/bookings/new"',
  'path="/v2/bookings/:journeyId"',
  'path="/v2/bookings/:journeyId/details"',
  'path="/v2/bookings/:journeyId/review"',
  'path="/v2/deliveries/:journeyId"',
  'path="/v2/deliveries/:journeyId/review"',
]) {
  if (!app.includes(route)) failures.push(`src/App.tsx: V2 route missing: ${route}`);
}
if (!app.includes('<V2JourneyRedirect target="BOOKING" />') || !app.includes('<V2JourneyRedirect target="DELIVERY" />')) {
  failures.push('src/App.tsx: legacy Booking/Delivery routes must redirect to V2.');
}

const dashboard = read('src/pages/DashboardPage.tsx');
for (const required of [
  'to="/v2/bookings/new"',
  '`/v2/bookings/${item.journeyId}`',
  '`/v2/bookings/${item.journeyId}/review`',
  '`/v2/deliveries/${item.journeyId}`',
]) {
  if (!dashboard.includes(required)) failures.push(`src/pages/DashboardPage.tsx: direct V2 navigation missing: ${required}`);
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

/* Booking V2 document-first contract. */
for (const text of [
  'Booking documents',
  'Customer ID',
  'Additional / if applicable',
  'Documents being classified',
  'Documents uploaded',
  'missing evidence will be flagged for audit',
]) {
  requireText('src/pages/BookingCaptureV2Page.tsx', text, `Booking V2 contract missing: ${text}`);
}
forbid(
  'src/pages/BookingCaptureV2Page.tsx',
  /blocksContinue[^\n]*disabled|!capture\.canContinue/,
  'Booking document/audit state must not block business continuation.',
);

/* Booking Details may require operational fields, but audit/document inconsistencies never block submission. */
forbid(
  'src/pages/BookingDetailsV2Page.tsx',
  /if\s*\(\s*!capture\.canContinue\s*\)|corporateMismatch\s*\|\|\s*busy|throw new Error\([^\n]*Corporate/,
  'audit/document state must not block Booking V2 submission.',
);
requireText('src/pages/BookingDetailsV2Page.tsx', 'Audit exceptions do not stop the business process.', 'Booking V2 must state the non-blocking audit rule.');

/* Extracted-field review must only open source evidence when a reliable box exists. */
for (const relativePath of [
  'src/pages/BookingReviewV2Page.tsx',
  'src/pages/DeliveryReviewV2Page.tsx',
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
console.log('VerticalFreeze=PROHIBITED_ROOT_AND_PAGE_SCROLL_REQUIRED');
console.log('BookingJourney=V2_ONLY_DIRECT_NAVIGATION_NON_BLOCKING_AUDIT');
console.log('DeliveryJourney=V2_ONLY_DIRECT_NAVIGATION_NON_BLOCKING_AUDIT');
console.log('ExtractedFieldEvidence=BOX_REQUIRED_OR_LOCATION_EXCEPTION');
console.log('Responsive=ADAPTIVE_REQUIRED');
