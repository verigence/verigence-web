import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (target !== 'android') {
  console.error('Usage: node scripts/finalize-native-branding.mjs android');
  process.exit(1);
}

const resourceRoot = path.resolve('android/app/src/main/res');
const baseForeground = path.join(resourceRoot, 'drawable', 'ic_launcher_foreground.xml');
const v24Foreground = path.join(resourceRoot, 'drawable-v24', 'ic_launcher_foreground.xml');
const splashDrawable = path.join(resourceRoot, 'drawable', 'splash.xml');
const splashMark = path.join(resourceRoot, 'drawable', 'verigence_splash_mark.png');
const launcherColors = path.join(resourceRoot, 'values', 'verigence_launcher_colors.xml');
const splashColors = path.join(resourceRoot, 'values', 'verigence_splash_colors.xml');
const stylesPath = path.join(resourceRoot, 'values', 'styles.xml');
const legacyLauncher = path.join(resourceRoot, 'mipmap-anydpi-v21', 'ic_launcher.xml');
const legacyRoundLauncher = path.join(resourceRoot, 'mipmap-anydpi-v21', 'ic_launcher_round.xml');

function readRequired(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

const foreground = readRequired(baseForeground, 'Verigence launcher foreground');
if (!foreground.includes('M64,136') || !foreground.includes('#00CBB0')) {
  throw new Error('Base launcher foreground is not the Verigence shield');
}

// The Capacitor Android template ships a drawable-v24 launcher foreground with
// the stock Android robot. On API 24+ Android selects that qualified resource
// instead of drawable/ic_launcher_foreground.xml. Overwrite it explicitly so
// modern devices resolve the Verigence shield, not the template icon.
fs.mkdirSync(path.dirname(v24Foreground), { recursive: true });
fs.writeFileSync(v24Foreground, foreground);

const resolvedV24 = readRequired(v24Foreground, 'API 24+ launcher foreground');
if (!resolvedV24.includes('M64,136')) {
  throw new Error('API 24+ launcher foreground is not the Verigence shield');
}
if (resolvedV24.includes('M66.94,46.02') || resolvedV24.includes('M32,64')) {
  throw new Error('Stock Android launcher artwork is still present in API 24+ foreground');
}

const splash = readRequired(splashDrawable, 'Verigence splash drawable');
if (!fs.existsSync(splashMark)) {
  throw new Error(`Verigence splash mark missing: ${splashMark}`);
}
if (!splash.includes('@drawable/verigence_splash_mark')) {
  throw new Error('Splash drawable does not reference the approved Verigence mark');
}

// White-background regression guard. These checks intentionally cover both
// adaptive launchers and legacy API 21 launchers, plus Android 12+ system splash.
const launcherColorXml = readRequired(launcherColors, 'Verigence launcher colors');
if (!launcherColorXml.includes('<color name="verigence_launcher_background">#FFFFFF</color>')) {
  throw new Error('Launcher background must remain pure white (#FFFFFF)');
}

for (const [filePath, label] of [
  [legacyLauncher, 'Legacy launcher'],
  [legacyRoundLauncher, 'Legacy round launcher'],
]) {
  const xml = readRequired(filePath, label);
  if (!xml.includes('android:fillColor="#FFFFFF"')) {
    throw new Error(`${label} background must remain white`);
  }
}

const splashColorXml = readRequired(splashColors, 'Verigence splash colors');
if (!splashColorXml.includes('<color name="verigence_splash_background">#FFFFFF</color>')) {
  throw new Error('Splash background must remain pure white (#FFFFFF)');
}

const stylesXml = readRequired(stylesPath, 'Android styles');
for (const required of [
  '<item name="windowSplashScreenBackground">@color/verigence_splash_background</item>',
  '<item name="windowSplashScreenAnimatedIcon">@drawable/verigence_splash_mark</item>',
  '<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
]) {
  if (!stylesXml.includes(required)) {
    throw new Error(`Android system splash configuration missing: ${required}`);
  }
}

console.log('ANDROID_API24_BRANDING_OVERRIDE=PASS');
console.log('ANDROID_STOCK_LAUNCHER_ART_REMOVED=PASS');
console.log('ANDROID_VERIGENCE_SPLASH_REFERENCE=PASS');
console.log('ANDROID_WHITE_LAUNCHER_BACKGROUND=PASS');
console.log('ANDROID_WHITE_SYSTEM_SPLASH_BACKGROUND=PASS');
