import { describe, expect, it } from 'vitest';

import { sortByName } from '../sortByName';

describe('sortByName', () => {
  it('orders A to Z without regard to case and leaves the original list alone', () => {
    const list = [{ n: 'bina' }, { n: 'Akash' }, { n: 'Chandini' }, { n: 'akansh' }];
    expect(sortByName(list, (x) => x.n).map((x) => x.n)).toEqual(['akansh', 'Akash', 'bina', 'Chandini']);
    expect(list[0].n).toBe('bina');
  });
  it('puts numbers in natural order and blanks last', () => {
    const list = [{ n: 'Outlet 10' }, { n: '' }, { n: 'Outlet 2' }, { n: null }];
    expect(sortByName(list, (x) => x.n).map((x) => x.n)).toEqual(['Outlet 2', 'Outlet 10', '', null]);
  });
});
