import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (target !== 'android') {
  console.error('Usage: node scripts/configure-native.mjs android');
  process.exit(1);
}

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) throw new Error(`Android manifest not found: ${manifestPath}`);

let xml = fs.readFileSync(manifestPath, 'utf8');
const entries = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
];

const missing = entries.filter((entry) => !xml.includes(entry));
if (missing.length) {
  xml = xml.replace(/\s*<application\b/, `\n    ${missing.join('\n    ')}\n\n    <application`);
}

if (!/android:usesCleartextTraffic=/.test(xml)) {
  xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="false"');
}

fs.writeFileSync(manifestPath, xml);
console.log('ANDROID_NATIVE_CONFIGURATION=PASS');
