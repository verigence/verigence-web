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

if (!fs.existsSync(baseForeground)) {
  throw new Error(`Verigence launcher foreground missing: ${baseForeground}`);
}
const foreground = fs.readFileSync(baseForeground, 'utf8');
if (!foreground.includes('M64,136') || !foreground.includes('#00CBB0')) {
  throw new Error('Base launcher foreground is not the Verigence shield');
}

// The Capacitor Android template ships a drawable-v24 launcher foreground with
// the stock Android robot. On API 24+ Android selects that qualified resource
// instead of drawable/ic_launcher_foreground.xml. Overwrite it explicitly so
// modern devices resolve the Verigence shield, not the template icon.
fs.mkdirSync(path.dirname(v24Foreground), { recursive: true });
fs.writeFileSync(v24Foreground, foreground);

const resolvedV24 = fs.readFileSync(v24Foreground, 'utf8');
if (!resolvedV24.includes('M64,136')) {
  throw new Error('API 24+ launcher foreground is not the Verigence shield');
}
if (resolvedV24.includes('M66.94,46.02') || resolvedV24.includes('M32,64')) {
  throw new Error('Stock Android launcher artwork is still present in API 24+ foreground');
}

if (!fs.existsSync(splashDrawable) || !fs.existsSync(splashMark)) {
  throw new Error('Verigence splash resources are missing');
}
const splash = fs.readFileSync(splashDrawable, 'utf8');
if (!splash.includes('@drawable/verigence_splash_mark')) {
  throw new Error('Splash drawable does not reference the approved Verigence mark');
}

console.log('ANDROID_API24_BRANDING_OVERRIDE=PASS');
console.log('ANDROID_STOCK_LAUNCHER_ART_REMOVED=PASS');
console.log('ANDROID_VERIGENCE_SPLASH_REFERENCE=PASS');
