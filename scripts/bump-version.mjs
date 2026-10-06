// Usage: npm run release:version -- 1.1.0
// Sets the version in package.json and moves everything under "Unreleased" in CHANGELOG.md to that version.
// Then commit both files; the Android release workflow reads the version and the notes from them.
import { readFileSync, writeFileSync } from 'node:fs';

import { bumpChangelog } from './changelog.mjs';

const version = process.argv[2];
if (!version) {
  console.error('Give the new version, for example: npm run release:version -- 1.1.0');
  process.exit(1);
}
const pkgPath = new URL('../package.json', import.meta.url);
const logPath = new URL('../CHANGELOG.md', import.meta.url);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
try {
  const updated = bumpChangelog(readFileSync(logPath, 'utf8'), version, today);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(logPath, updated);
  console.log(`Version ${version} recorded in package.json and CHANGELOG.md. Commit both, then run "Publish Verigence Android App".`);
} catch (problem) {
  console.error(problem instanceof Error ? problem.message : String(problem));
  process.exit(1);
}
