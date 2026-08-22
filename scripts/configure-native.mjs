import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!['android', 'ios', 'all'].includes(target)) {
  console.error('Usage: node scripts/configure-native.mjs <android|ios|all>');
  process.exit(1);
}

function configureAndroid() {
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
    fs.writeFileSync(manifestPath, xml);
  }
  console.log('ANDROID_NATIVE_PERMISSIONS=PASS');
}

function plistEntry(key, value) {
  return `\t<key>${key}</key>\n\t<string>${value}</string>`;
}

function configureIos() {
  const plistPath = path.resolve('ios/App/App/Info.plist');
  if (!fs.existsSync(plistPath)) throw new Error(`iOS Info.plist not found: ${plistPath}`);

  let plist = fs.readFileSync(plistPath, 'utf8');
  const entries = [
    ['NSCameraUsageDescription', 'Verigence uses the camera to capture audit evidence.'],
    ['NSPhotoLibraryUsageDescription', 'Verigence can access selected photos when you add audit evidence.'],
    ['NSPhotoLibraryAddUsageDescription', 'Verigence can save evidence photos when you choose to keep them.'],
    ['NSLocationWhenInUseUsageDescription', 'Verigence uses your location when a workflow requires location-backed evidence.'],
  ];

  const additions = entries
    .filter(([key]) => !plist.includes(`<key>${key}</key>`))
    .map(([key, value]) => plistEntry(key, value));

  if (additions.length) {
    plist = plist.replace(/\n<\/dict>/, `\n${additions.join('\n')}\n</dict>`);
    fs.writeFileSync(plistPath, plist);
  }
  console.log('IOS_NATIVE_PERMISSIONS=PASS');
}

if (target === 'android' || target === 'all') configureAndroid();
if (target === 'ios' || target === 'all') configureIos();
