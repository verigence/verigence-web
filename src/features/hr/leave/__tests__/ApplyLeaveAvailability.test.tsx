import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import ApplyLeaveForm from '../ApplyLeaveForm';
import { availableByType } from '../leaveLogic';

const render = (available?: Parameters<typeof ApplyLeaveForm>[0]['available']) =>
  renderToString(
    <ApplyLeaveForm busy={false} serverError="" onSubmit={() => {}} onEdit={() => {}} available={available} />,
  ).replaceAll('<!-- -->', '');

describe('paid leave only when it is available (12 and 16 Nov 2026)', () => {
  it('paid leave and comp-off with nothing available cannot be chosen', () => {
    const html = render({ PAID: 0, COMP_OFF: 0, SPECIAL: 0 });
    expect(html).toContain('<option value="PAID" disabled="">Paid leave (none available)</option>');
    expect(html).toContain('<option value="COMP_OFF" disabled="">Comp-off (none available)</option>');
    // birthday leave depends on the dates chosen; the server decides it
    expect(html).toMatch(/<option value="SPECIAL">/);
    expect(html).toMatch(/<option value="UNPAID">/);
  });

  it('nothing is disabled until the balance has loaded, or when some is left', () => {
    expect(render()).not.toContain('none available');
    expect(render({ PAID: 1.5 })).not.toContain('Paid leave (none available)');
  });

  it('reads what is available from the balance', () => {
    expect(availableByType({ types: [{ leaveType: 'PAID', available: 0.5 }, { leaveType: 'COMP_OFF', available: 0 }] })).toEqual({
      PAID: 0.5,
      COMP_OFF: 0,
    });
    expect(availableByType(undefined)).toBeUndefined();
  });
});
