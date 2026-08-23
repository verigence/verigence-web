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

function setApplicationAttribute(source, name, value) {
  return source.replace(/<application\b[^>]*>/, (tag) => {
    const expression = new RegExp(`android:${name}="[^"]*"`);
    if (expression.test(tag)) return tag.replace(expression, `android:${name}="${value}"`);
    return tag.replace('<application', `<application android:${name}="${value}"`);
  });
}

xml = setApplicationAttribute(xml, 'usesCleartextTraffic', 'false');
xml = setApplicationAttribute(xml, 'icon', '@mipmap/ic_launcher');
xml = setApplicationAttribute(xml, 'roundIcon', '@mipmap/ic_launcher_round');
fs.writeFileSync(manifestPath, xml);

const resourceRoot = path.resolve('android/app/src/main/res');
function writeResource(relativePath, content) {
  const destination = path.join(resourceRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${content.trim()}\n`);
}

const brandPaths = `
    <path android:fillColor="#0A63C7" android:pathData="M64,136 C136,119 196,91 256,52 L256,126 C205,159 151,178 83,191 Z" />
    <path android:fillColor="#00CBB0" android:pathData="M256,52 C318,91 378,118 448,136 L424,191 C357,178 305,159 256,126 Z" />
    <path android:fillColor="#0A63C7" android:pathData="M82,191 L137,218 C140,325 176,398 256,447 L256,505 C138,454 80,368 68,258 L68,188 Z" />
    <path android:fillColor="#00D3A7" android:pathData="M443,190 L443,264 C433,368 371,454 256,505 L256,447 C332,401 377,330 389,254 L345,294 L315,260 Z" />
    <path android:fillColor="#00AFA8" android:pathData="M148,258 L255,371 L392,230 L430,267 L255,443 L116,298 Z" />
    <path android:fillColor="#0A63C7" android:pathData="M170,205 L201,205 L201,311 L170,311 Z" />
    <path android:fillColor="#087FC0" android:pathData="M211,177 L242,177 L242,341 L211,341 Z" />
    <path android:fillColor="#00AFA8" android:pathData="M252,151 L283,151 L283,367 L252,367 Z" />
    <path android:fillColor="#00C2AA" android:pathData="M293,177 L324,177 L324,341 L293,341 Z" />
    <path android:fillColor="#00D3A7" android:pathData="M334,205 L365,205 L365,311 L334,311 Z" />`;

const monochromePaths = `
    <path android:fillColor="#FFFFFFFF" android:pathData="M64,136 C136,119 196,91 256,52 L256,126 C205,159 151,178 83,191 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M256,52 C318,91 378,118 448,136 L424,191 C357,178 305,159 256,126 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M82,191 L137,218 C140,325 176,398 256,447 L256,505 C138,454 80,368 68,258 L68,188 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M443,190 L443,264 C433,368 371,454 256,505 L256,447 C332,401 377,330 389,254 L345,294 L315,260 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M148,258 L255,371 L392,230 L430,267 L255,443 L116,298 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M170,205 L201,205 L201,311 L170,311 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M211,177 L242,177 L242,341 L211,341 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M252,151 L283,151 L283,367 L252,367 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M293,177 L324,177 L324,341 L293,341 Z" />
    <path android:fillColor="#FFFFFFFF" android:pathData="M334,205 L365,205 L365,311 L334,311 Z" />`;

const foregroundVector = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <group
      android:scaleX="0.68"
      android:scaleY="0.68"
      android:translateX="81.92"
      android:translateY="81.92">
${brandPaths}
  </group>
</vector>`;

const monochromeVector = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <group
      android:scaleX="0.68"
      android:scaleY="0.68"
      android:translateX="81.92"
      android:translateY="81.92">
${monochromePaths}
  </group>
</vector>`;

const legacyVector = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <path
      android:fillColor="#021A3A"
      android:pathData="M120,16 H392 C449.4,16 496,62.6 496,120 V392 C496,449.4 449.4,496 392,496 H120 C62.6,496 16,449.4 16,392 V120 C16,62.6 62.6,16 120,16 Z" />
  <group
      android:scaleX="0.68"
      android:scaleY="0.68"
      android:translateX="81.92"
      android:translateY="81.92">
${brandPaths}
  </group>
</vector>`;

const legacyRoundVector = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <path
      android:fillColor="#021A3A"
      android:pathData="M256,16 C388.5,16 496,123.5 496,256 C496,388.5 388.5,496 256,496 C123.5,496 16,388.5 16,256 C16,123.5 123.5,16 256,16 Z" />
  <group
      android:scaleX="0.68"
      android:scaleY="0.68"
      android:translateX="81.92"
      android:translateY="81.92">
${brandPaths}
  </group>
</vector>`;

const adaptiveIcon = `
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/verigence_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;

const adaptiveIconThemed = `
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/verigence_launcher_background" />
  <foreground android:drawable="@drawable/ic_launcher_foreground" />
  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>`;

const launcherColors = `
<resources>
  <color name="verigence_launcher_background">#021A3A</color>
</resources>`;

writeResource('drawable/ic_launcher_foreground.xml', foregroundVector);
writeResource('drawable/ic_launcher_monochrome.xml', monochromeVector);
writeResource('values/verigence_launcher_colors.xml', launcherColors);
writeResource('mipmap-anydpi-v21/ic_launcher.xml', legacyVector);
writeResource('mipmap-anydpi-v21/ic_launcher_round.xml', legacyRoundVector);
writeResource('mipmap-anydpi-v26/ic_launcher.xml', adaptiveIcon);
writeResource('mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveIcon);
writeResource('mipmap-anydpi-v33/ic_launcher.xml', adaptiveIconThemed);
writeResource('mipmap-anydpi-v33/ic_launcher_round.xml', adaptiveIconThemed);

const approvedSplashMark = path.resolve('public/brand/approved/verigence-mark.png');
if (!fs.existsSync(approvedSplashMark)) {
  throw new Error(`Approved Verigence splash mark not found: ${approvedSplashMark}`);
}

for (const entry of fs.readdirSync(resourceRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue;
  const generatedSplash = path.join(resourceRoot, entry.name, 'splash.png');
  if (fs.existsSync(generatedSplash)) fs.unlinkSync(generatedSplash);
}

const splashMarkDestination = path.join(resourceRoot, 'drawable', 'verigence_splash_mark.png');
fs.mkdirSync(path.dirname(splashMarkDestination), { recursive: true });
fs.copyFileSync(approvedSplashMark, splashMarkDestination);

const splashColors = `
<resources>
  <color name="verigence_splash_background">#FFFFFF</color>
</resources>`;

const splashDrawable = `
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/verigence_splash_background" />
  <item android:gravity="center">
    <bitmap
        android:src="@drawable/verigence_splash_mark"
        android:gravity="center" />
  </item>
</layer-list>`;

writeResource('values/verigence_splash_colors.xml', splashColors);
writeResource('drawable/splash.xml', splashDrawable);

console.log('ANDROID_NATIVE_CONFIGURATION=PASS');
console.log('ANDROID_BRANDED_LAUNCHER_ICON=PASS');
console.log('ANDROID_BRANDED_SPLASH=PASS');
