import fs from 'node:fs';
import path from 'node:path';

const resourceRoot = path.resolve('android/app/src/main/res');
if (!fs.existsSync(resourceRoot)) {
  throw new Error(`Android resource directory not found: ${resourceRoot}`);
}

function writeResource(relativePath, content) {
  const destination = path.join(resourceRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${content.trim()}\n`);
}

function removeIfPresent(relativePath) {
  const target = path.join(resourceRoot, relativePath);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

// Android 13+ uses mipmap-anydpi-v33 when present. The generated v33 icon
// declares a monochrome layer, which lets launchers replace the approved
// coloured Verigence mark with a system-tinted glyph. Keep the v26 adaptive
// icon as the newest launcher resource so the brand colours remain intact.
removeIfPresent('mipmap-anydpi-v33/ic_launcher.xml');
removeIfPresent('mipmap-anydpi-v33/ic_launcher_round.xml');

const launcherForeground = path.join(resourceRoot, 'drawable', 'ic_launcher_foreground.xml');
if (!fs.existsSync(launcherForeground)) {
  throw new Error('Verigence launcher foreground is missing');
}
const launcherXml = fs.readFileSync(launcherForeground, 'utf8');
for (const colour of ['#0A63C7', '#00AFA8', '#00D3A7']) {
  if (!launcherXml.includes(colour)) {
    throw new Error(`Launcher foreground is missing expected Verigence colour ${colour}`);
  }
}

// Release AAPT2 previously failed intermittently while recompiling the copied
// splash PNG. Use a dedicated vector made from the same approved Verigence mark
// paths instead of replacing the splash with a generic launcher drawable.
removeIfPresent('drawable/verigence_splash_mark.png');

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

const splashVector = `
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
  <group
      android:scaleX="0.58"
      android:scaleY="0.58"
      android:translateX="107.52"
      android:translateY="107.52">
${brandPaths}
  </group>
</vector>`;

writeResource('drawable/verigence_splash_mark.xml', splashVector);

const splashPath = path.join(resourceRoot, 'drawable', 'verigence_splash_mark.xml');
const splashXml = fs.readFileSync(splashPath, 'utf8');
if (!splashXml.includes('#0A63C7') || !splashXml.includes('#00AFA8')) {
  throw new Error('Verigence splash vector validation failed');
}

console.log('ANDROID_COLOURED_LAUNCHER_ICON=PASS');
console.log('ANDROID_BRANDED_VECTOR_SPLASH=PASS');
