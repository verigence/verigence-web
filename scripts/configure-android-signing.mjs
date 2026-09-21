import fs from 'node:fs';
import path from 'node:path';

/**
 * Wires a release signingConfig into the Capacitor-generated
 * android/app/build.gradle, read entirely from environment variables at
 * Gradle-build time (never written into the file itself) -- CI decodes the
 * keystore and derives its alias in a separate step before this runs. The
 * signingConfig and its use on buildTypes.release are both conditional on
 * ANDROID_RELEASE_KEYSTORE_PATH being set, so a build with no signing
 * secrets available (a fork PR, a local run) keeps producing today's
 * unsigned app-release-unsigned.apk instead of failing Gradle configuration.
 */
const target = process.argv[2];
if (target !== 'android') {
  console.error('Usage: node scripts/configure-android-signing.mjs android');
  process.exit(1);
}

const gradlePath = path.resolve('android/app/build.gradle');
if (!fs.existsSync(gradlePath)) throw new Error(`Android app build.gradle not found: ${gradlePath}`);

let gradle = fs.readFileSync(gradlePath, 'utf8');

if (gradle.includes('ANDROID_RELEASE_KEYSTORE_PATH')) {
  // Already patched (re-run of this script against the same checkout) --
  // nothing else to do.
  process.exit(0);
}

const signingConfigsBlock = `    signingConfigs {
        release {
            if (System.getenv("ANDROID_RELEASE_KEYSTORE_PATH") != null) {
                storeFile file(System.getenv("ANDROID_RELEASE_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_RELEASE_STORE_PASSWORD")
                keyAlias System.getenv("ANDROID_RELEASE_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
            }
        }
    }
`;

if (!gradle.includes('android {')) throw new Error("build.gradle has no 'android {' block to patch");
gradle = gradle.replace('android {\n', `android {\n${signingConfigsBlock}`);

const releaseBuildType = /release\s*\{\n(\s*minifyEnabled[^]*?)\n(\s*)\}/;
const match = gradle.match(releaseBuildType);
if (!match) throw new Error("buildTypes.release block not found in the expected shape");
gradle = gradle.replace(
  releaseBuildType,
  `release {\n${match[1]}\n            if (System.getenv("ANDROID_RELEASE_KEYSTORE_PATH") != null) {\n                signingConfig signingConfigs.release\n            }\n${match[2]}}`,
);

fs.writeFileSync(gradlePath, gradle);
