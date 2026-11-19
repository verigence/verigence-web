import { describe, expect, it } from 'vitest';

import { filterTaskSwitches, switchOutcome, type TaskSwitch } from '../taskSwitches';

// Product owner 19 Nov: "is there a way i can see the list of the tasks being produced and tick
// them off ... at the project level and it should be under project administration only".
const item = (over: Partial<TaskSwitch>): TaskSwitch => ({
  code: 'X', name: 'X', example: null, category: 'Checks', owner: 'Team Lead', open: 0, raisedLast30Days: 0,
  lastRaisedAtUtc: null, enabled: true, reason: null, changedByName: null, changedAtUtc: null, ...over,
});

const items = [
  item({ code: 'PAYMENT_BEFORE_BOOKING', name: 'Payment dated before the booking', category: 'Payments & Reconciliation', open: 103 }),
  item({ code: 'DELIVERY_NOT_COMPLETED_IN_TIME', name: 'Delivery not completed in time', enabled: false }),
  item({ code: 'MANUAL_VERIFICATION', name: 'Manual verification', owner: 'PC', example: 'Check 1 date on Payment Receipt' }),
];

describe('task switches', () => {
  it('filters by on / off and by a search over name, code, category, owner and example', () => {
    expect(filterTaskSwitches(items, '', 'OFF').map((i) => i.code)).toEqual(['DELIVERY_NOT_COMPLETED_IN_TIME']);
    expect(filterTaskSwitches(items, '', 'ON')).toHaveLength(2);
    expect(filterTaskSwitches(items, 'payment', 'ALL').map((i) => i.code)).toEqual(['PAYMENT_BEFORE_BOOKING', 'MANUAL_VERIFICATION']);
    expect(filterTaskSwitches(items, 'manual_verification', 'ALL')).toHaveLength(1);
    expect(filterTaskSwitches(items, 'payment', 'OFF')).toEqual([]);
  });

  it('says what a change did', () => {
    expect(switchOutcome({ code: 'X', enabled: false, tasksClosed: 103 })).toBe('Switched off. 103 open tasks closed on the existing journeys.');
    expect(switchOutcome({ code: 'X', enabled: false, tasksClosed: 1 })).toBe('Switched off. 1 open task closed on the existing journeys.');
    expect(switchOutcome({ code: 'X', enabled: true, bookingsRechecked: 1611 }))
      .toBe('Switched on. 1611 bookings are being checked again; the tasks that still apply come back shortly.');
  });
});
