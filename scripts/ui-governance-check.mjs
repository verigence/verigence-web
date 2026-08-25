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
  '.uc03-booking-journey .uc03-c1-topbar > span',
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

forbid(
  'src/layout/AppShell.tsx',
  /selectedProject\?*\.projectName|selectedProject\.projectName|Current Project|Switch Project/,
  'Project Name / Project identity must not be rendered in the shared application shell.',
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

const operationalFiles = [
  'src/pages/DeliveryWorkspacePage.tsx',
  'src/pages/AuditReviewPage.tsx',
];
for (const relativePath of operationalFiles) {
  forbid(relativePath, /\.projectName\b|\.dealerName\b|\.outletName\b/, 'operational screens may not render Project, Dealer or Outlet names.');
}

const booking = read('src/pages/BookingWorkspacePage.tsx');
const bookingProjectNameCount = (booking.match(/project\.projectName/g) || []).length;
if (bookingProjectNameCount > 1) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Project Name may not be introduced anywhere else in Booking.');
}
if (bookingProjectNameCount === 1 && !governanceCss.includes('.uc03-booking-journey .uc03-c1-topbar > span')) {
  failures.push('Booking Project context is not governed/hidden.');
}
if (/\.dealerName\b|\.outletName\b/.test(booking)) {
  failures.push('src/pages/BookingWorkspacePage.tsx: Dealer/Outlet names are landing-page-only.');
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
console.log('ProjectName=PROHIBITED_OPERATIONAL_UI');
console.log('DealerOutlet=LANDING_ONLY');
console.log('VerticalFreeze=PROHIBITED_SCROLL_FALLBACK_REQUIRED');
console.log('Responsive=ADAPTIVE_REQUIRED');
