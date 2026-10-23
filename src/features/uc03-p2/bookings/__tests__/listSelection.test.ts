import { describe, expect, it } from 'vitest';

import { panelSelection } from '../listSelection';

describe('a click on the Outlet-wise or PC-wise panel', () => {
  it('picks the row and shows its complete list, whichever tab was open', () => {
    expect(panelSelection('', 'outlet-1', 'needs_tl')).toEqual({ key: 'outlet-1', view: 'all' });
    expect(panelSelection('outlet-1', 'outlet-2', 'closed')).toEqual({ key: 'outlet-2', view: 'all' });
  });

  it('clears the pick when the picked row is clicked again, leaving the tab as it is', () => {
    expect(panelSelection('outlet-1', 'outlet-1', 'all')).toEqual({ key: '', view: 'all' });
    expect(panelSelection('outlet-1', 'outlet-1', 'overdue')).toEqual({ key: '', view: 'overdue' });
  });

  it('does nothing for a row with no key (a PC not recorded)', () => {
    expect(panelSelection('', '', 'needs_tl')).toEqual({ key: '', view: 'needs_tl' });
  });
});
