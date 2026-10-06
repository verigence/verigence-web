// Prints the release notes of the version in package.json, from CHANGELOG.md.
// Exits with an error when that version has no notes, so a release cannot go out untracked.
import { readFileSync } from 'node:fs';

import { releaseNotes } from './changelog.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const notes = releaseNotes(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
if (!notes) {
  console.error(`CHANGELOG.md has no notes for version ${version}. Run "npm run release:version -- ${version}" (or a newer number) first.`);
  process.exit(1);
}
process.stdout.write(`${notes}\n`);
