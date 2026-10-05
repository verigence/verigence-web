import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { bumpChangelog, listedVersions, releaseNotes } from '../../scripts/changelog.mjs';

const sample = `# Log

## [Unreleased]

### Added
- New thing.

## [0.2.0] - 2026-10-01

- Older thing.

## [0.1.0] - baseline

First.
`;

describe('changelog helpers', () => {
  it('reads the notes of one version only', () => {
    expect(releaseNotes(sample, '0.2.0')).toBe('- Older thing.');
    expect(releaseNotes(sample, '0.1.0')).toBe('First.');
    expect(releaseNotes(sample, '0.3.0')).toBeNull();
    expect(releaseNotes(sample, '0.2')).toBeNull();
  });

  it('moves Unreleased under the new version and leaves an empty Unreleased', () => {
    const out = bumpChangelog(sample, '0.3.0', '2026-10-06');
    expect(releaseNotes(out, '0.3.0')).toBe('### Added\n- New thing.');
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[0\.3\.0\] - 2026-10-06/);
    expect(releaseNotes(out, '0.2.0')).toBe('- Older thing.');
    expect(listedVersions(out)).toEqual(['0.3.0', '0.2.0', '0.1.0']);
    expect(out.endsWith('\n') && !out.endsWith('\n\n')).toBe(true);
  });

  it('refuses a bad version, a repeated version, and nothing to release', () => {
    expect(() => bumpChangelog(sample, 'v3', '2026-10-06')).toThrow(/not a version/);
    expect(() => bumpChangelog(sample, '0.2.0', '2026-10-06')).toThrow(/already has an entry/);
    const empty = bumpChangelog(sample, '0.3.0', '2026-10-06');
    expect(() => bumpChangelog(empty, '0.4.0', '2026-10-06')).toThrow(/Nothing is listed/);
    expect(() => bumpChangelog('# no heading', '0.4.0', '2026-10-06')).toThrow(/no "## \[Unreleased\]"/);
  });
});

describe('this repository keeps its version tracked', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const log = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');

  it('has notes for the version in package.json and an Unreleased section', () => {
    expect(releaseNotes(log, pkg.version), `CHANGELOG.md needs notes for ${pkg.version}`).not.toBeNull();
    expect(log).toMatch(/^## \[Unreleased\]/m);
  });
});
