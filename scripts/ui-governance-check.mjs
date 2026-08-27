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
  '.uc03-booking-step-panel',
  '.uc03-booking-document-grid',
  '.uc03-booking-form-grid',
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

forbid(
  'src/layout/AppShell.tsx',
  /selectedProject\?*\.projectName|selectedProject\.projectName|Current Project|Switch Project/,
  'UC03 PC/TL/PM shell must not render Project Name / Project identity.',
);
requireText('src/layout/AppShell.tsx', 'Current Workspace', 'shared shell must use neutral Workspace context.');
requireText('src/layout/AppShell.tsx', 'Switch Workspace', 'project switching must be labelled as Workspace switching.');

forbid(
  'src/components/ProjectContextGate.tsx',
  /\.projectName\b|\.dealerName\b|\.outletName\b/,
  'UC03 selection/gate screens must not render Project/Dealer/Outlet names.',
);
requireText('src/components/ProjectContextGate.tsx', 'Choose Workspace', 'selection screen must use neutral Workspace wording.');
requireText('src/components/ProjectContextGate.tsx', 'Choose Work Location', 'outlet selection must use neutral Work Location wording.');

const uc03OperationalFiles = [
  'src/pages/DashboardPage.tsx',
  'src/pages/CreateBookingPage.tsx',
  'src/pages/BookingWorkspacePage.tsx',
  'src/pages/BookingReviewPage.tsx',
  'src/pages/DeliveryWorkspacePage.tsx',
  'src/pages/AuditReviewPage.tsx',
];
for (const relativePath of uc03OperationalFiles) {
  forbid(relativePath, /\.projectName\b/, 'UC03 PC/TL/PM operational screens must not render Project Name.');
}

const operationalFiles = [
  'src/pages/DeliveryWorkspacePage.tsx',
  'src/pages/AuditReviewPage.tsx',
];
for (const relativePath of operationalFiles) {
  forbid(relativePath, /\.dealerName\b|\.outletName\b/, 'operational screens may not render Dealer or Outlet names.');
}

const booking = read('src/pages/BookingWorkspacePage.tsx');
if (/\.dealerName\b|\.outletName\b/.test(booking)) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Dealer/Outlet names are landing-page-only.');
}

/* Booking is a functional acceptance surface, not a screenshot-only surface. */
for (const uploadTitle of [
  'Booking Form / Booking Docket',
  'Booking Payment Receipt(s)',
  'PAN',
  'Aadhaar',
]) {
  if (!booking.includes(`title="${uploadTitle}"`)) {
    failures.push(`src/pages/BookingWorkspacePage.tsx: Step 1 upload card missing: ${uploadTitle}`);
  }
}
if (!booking.includes('label="GST Benefit"')) {
  failures.push('src/pages/BookingWorkspacePage.tsx: GST Benefit point is required on Booking Details.');
}
if (!booking.includes('label="Corporate ID Available"')) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Corporate ID availability point is required for Corporate Booking.');
}
if (!booking.includes("form.customerType === 'CORPORATE'")) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Corporate Booking conditional path is missing.');
}
if (!booking.includes("form.gstBenefit === true") || !booking.includes('GST Certificate')) {
  failures.push('src/pages/BookingWorkspacePage.tsx: GST Certificate conditional evidence path is missing.');
}
if (!booking.includes("form.corporateIdAvailable === true") || !booking.includes('Corporate ID')) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Corporate ID conditional evidence path is missing.');
}

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
console.log('ProjectName=PROHIBITED_UC03_PC_TL_PM_UI');
console.log('DealerOutlet=LANDING_ONLY');
console.log('VerticalFreeze=PROHIBITED_ROOT_AND_PAGE_SCROLL_REQUIRED');
console.log('BookingStep1=FOUR_UPLOADS_REQUIRED_AND_REACHABLE');
console.log('BookingStep2=GST_AND_CORPORATE_PATH_REQUIRED');
console.log('Responsive=ADAPTIVE_REQUIRED');
