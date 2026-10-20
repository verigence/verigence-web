import { describe, expect, it } from 'vitest';

import { previousScreen, screenName } from '../BackLink';

const J = '/p2/journeys/j1';

describe('previousScreen', () => {
  it('skips history on the same screen (a document opened on Documents)', () => {
    const visited = [
      { key: 'a', path: `${J}/overview?tab=payments` },
      { key: 'b', path: `${J}/documents` },
      { key: 'c', path: `${J}/documents?doc=d1` },
      { key: 'd', path: `${J}/documents?doc=d2` },
    ];
    const back = previousScreen(visited, 'd', `${J}/documents`);
    expect(back).toEqual({ path: `${J}/overview?tab=payments`, steps: 3 });
    expect(screenName(back!.path)).toBe('Journey 360 · Payments');
  });

  it('treats a new booking getting its journey id as the same screen', () => {
    const visited = [
      { key: 'a', path: '/p2' },
      { key: 'b', path: '/p2/journeys/new/documents' },
      { key: 'c', path: `${J}/documents` },
    ];
    expect(previousScreen(visited, 'c', `${J}/documents`)).toEqual({ path: '/p2', steps: 2 });
  });

  it('goes one step back when the previous entry is another screen', () => {
    const visited = [{ key: 'a', path: '/reviews' }, { key: 'b', path: `${J}/overview` }];
    expect(previousScreen(visited, 'b', `${J}/overview`)).toEqual({ path: '/reviews', steps: 1 });
  });

  it('has nothing to go back to when only this screen was visited', () => {
    const visited = [{ key: 'a', path: `${J}/documents` }, { key: 'b', path: `${J}/documents?doc=d1` }];
    expect(previousScreen(visited, 'b', `${J}/documents`)).toBeNull();
    expect(previousScreen(visited, 'x', `${J}/documents`)).toBeNull();
  });
});
