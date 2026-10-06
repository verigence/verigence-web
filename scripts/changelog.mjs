// Reads and updates CHANGELOG.md. No dependencies, so it also runs in the release workflow.

const UNRELEASED = /^## \[Unreleased\][^\n]*$/m;

/** The text under "## [version]" up to the next "## [", trimmed. Null when the version has no entry or the entry is empty. */
export function releaseNotes(changelog, version) {
  const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\n]*$`, 'm');
  const found = heading.exec(changelog);
  if (!found) return null;
  const rest = changelog.slice(found.index + found[0].length);
  const next = rest.search(/^## \[/m);
  const body = (next === -1 ? rest : rest.slice(0, next)).trim();
  return body.length > 0 ? body : null;
}

/** The changelog with everything under "Unreleased" moved under a new "## [version] - date" heading. Throws when there is nothing to release or the version already has an entry. */
export function bumpChangelog(changelog, version, date) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`"${version}" is not a version like 1.2.3.`);
  if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) throw new Error(`Version ${version} already has an entry.`);
  const found = UNRELEASED.exec(changelog);
  if (!found) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading.');
  const after = changelog.slice(found.index + found[0].length);
  const next = after.search(/^## \[/m);
  const body = (next === -1 ? after : after.slice(0, next)).trim();
  if (!body) throw new Error('Nothing is listed under "Unreleased", so there is nothing to release.');
  const tail = next === -1 ? '' : after.slice(next);
  return `${changelog.slice(0, found.index)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n${tail}`.replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}

/** Newest first: the version numbers that have an entry. */
export function listedVersions(changelog) {
  return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
}
