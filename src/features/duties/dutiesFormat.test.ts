import { describe, expect, it } from 'vitest';

import type { DutyReasonCategory, MyDay, MyDutyItem, TeamDutyCell } from '../../services/audit-core/duties';
import {
  activeDays, closeReasons, coversGateRegister, dayLabel, forLabel, needsReason, reasonsNeeded, teamCellDetail,
  tickProblem, valuesLabel, weekdaysLabel,
} from './dutiesFormat';

const item = (over: Partial<MyDutyItem> = {}): MyDutyItem => ({
  itemId: 'i1', dutyId: 'd1', title: 'Cash ledger', description: '', mandatory: true, dutyDate: '2026-11-18',
  forDate: '2026-11-17', status: 'PENDING', carriedDays: 0, daysLeft: 5, closeMode: 'TICK', checkerCode: null,
  hint: null, nilLabel: null, progress: null, checkFailed: false, inputs: [], values: {}, comment: null,
  allowNotReceived: true, doneAt: null, doneByName: null, doneSource: null, canTick: true, canUndo: false,
  myReason: null, reasons: [], ...over,
});
const day = (items: MyDutyItem[], over: Partial<MyDay> = {}): MyDay => ({
  enabled: true, date: '2026-11-18', role: 'PC', applies: true,
  outlets: [{ outletId: 'o1', outletName: 'Cuttack', dealerName: 'Utkal', colleagues: [{ actorId: 'pc2', name: 'Asha' }], items }],
  ...over,
});
const CATEGORIES: DutyReasonCategory[] = [
  { code: 'NOT_GIVEN_BY_DEALERSHIP', label: 'Dealership did not give it', side: 'DEALERSHIP' },
  { code: 'HANDLED_BY_OTHER_PC', label: 'Another PC is doing it', side: 'PC', needsPerson: true },
  { code: 'OTHER', label: 'Other', side: 'PC', needsRemark: true },
];

describe('daily duties', () => {
  it('names days and what a duty is for', () => {
    expect(dayLabel('2026-11-17')).toBe('Tue 17 Nov');
    expect(forLabel(item(), '2026-11-18')).toBe('for Tue 17 Nov');
    expect(forLabel(item({ forDate: '2026-11-18' }), '2026-11-18')).toBeNull();
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6])).toBe('Mon to Sat');
    expect(weekdaysLabel([7, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(weekdaysLabel([1, 3])).toBe('Mon, Wed');
  });

  it('checks the values of a tick before it is sent', () => {
    const inputs = [
      { key: 'amount', label: 'Amount', type: 'AMOUNT' as const, required: true },
      { key: 'transactions', label: 'Transactions', type: 'NUMBER' as const, required: true },
      { key: 'note', label: 'Note', type: 'TEXT' as const, required: false },
    ];
    expect(tickProblem(inputs, {})).toBe('Enter Amount.');
    expect(tickProblem(inputs, { amount: 'abc', transactions: '2' })).toBe('Amount must be a number, 0 or more.');
    expect(tickProblem(inputs, { amount: '1,25,000.50', transactions: '2.5' })).toBe('Transactions must be a whole number.');
    expect(tickProblem(inputs, { amount: '1,25,000.50', transactions: '0' })).toBeUndefined();
    expect(valuesLabel(inputs, { amount: 125000.5, transactions: 7 })).toBe('Amount 1,25,000.5 · Transactions 7');
  });

  it('asks a reason only for a mandatory duty that is pending with none given', () => {
    expect(needsReason(item())).toBe(true);
    expect(needsReason(item({ mandatory: false }))).toBe(false);
    for (const status of ['DONE', 'ON_TRACK', 'NOT_RECEIVED'] as const) expect(needsReason(item({ status }))).toBe(false);
    const days = [
      { tenantId: 't1', projectName: 'Mahindra Orissa', day: day([item(), item({ itemId: 'i2', status: 'DONE' })]) },
      { tenantId: 't2', projectName: 'Off', day: day([item()], { enabled: false }) },
      { tenantId: 't3', projectName: 'Not a PC there', day: day([item()], { applies: false }) },
    ];
    expect(activeDays(days).map((d) => d.tenantId)).toEqual(['t1']);
    expect(reasonsNeeded(days)).toBe(1);
  });

  it('knows when the duty list covers the gate register warning at check-out', () => {
    const days = [{ tenantId: 't1', projectName: 'P', day: day([item({ checkerCode: 'GATE_REGISTER', closeMode: 'AUTO' })]) }];
    expect(coversGateRegister(days, 't1')).toBe(true);
    expect(coversGateRegister(days, 't2')).toBe(false);
    expect(coversGateRegister([{ tenantId: 't1', projectName: 'P', day: day([item()]) }], 't1')).toBe(false);
  });

  it('builds the reasons of a day close, or says what is missing', () => {
    const items = [item(), item({ itemId: 'i2', title: 'Bank statement' }), item({ itemId: 'i3', status: 'DONE' })];
    expect(closeReasons(items, {}, CATEGORIES).problem).toBe('Choose a reason for "Cash ledger".');
    const drafts = {
      i1: { category: 'OTHER', remark: 'x', handledByActorId: '' },
      i2: { category: 'HANDLED_BY_OTHER_PC', remark: '', handledByActorId: '' },
    };
    expect(closeReasons(items, drafts, CATEGORIES).problem).toBe('Say why "Cash ledger" is not done, in a few words.');
    drafts.i1.remark = 'Accountant away';
    expect(closeReasons(items, drafts, CATEGORIES).problem).toBe('Choose the PC who is doing "Bank statement".');
    drafts.i2.handledByActorId = 'pc2';
    expect(closeReasons(items, drafts, CATEGORIES)).toEqual({ reasons: [
      { itemId: 'i1', category: 'OTHER', remark: 'Accountant away', handledByActorId: null },
      { itemId: 'i2', category: 'HANDLED_BY_OTHER_PC', remark: null, handledByActorId: 'pc2' },
    ] });
  });

  it('says in one line what a team cell stands on', () => {
    const cell = (over: Partial<TeamDutyCell>): TeamDutyCell => ({
      itemId: 'i1', dutyId: 'd1', title: 'Cash ledger', mandatory: true, forDate: '2026-11-17', dutyDate: '2026-11-18',
      state: 'PENDING', carriedDays: 0, doneAt: null, doneByName: null, doneSource: null, values: {}, inputs: [],
      comment: null, progress: null, reasons: [], ...over,
    });
    expect(teamCellDetail(cell({ state: 'DONE', doneByName: 'Ravi', doneSource: 'PC', doneAt: '2026-11-18T05:35:00Z',
      inputs: [{ key: 'amount', label: 'Amount', type: 'AMOUNT', required: true }], values: { amount: 5000 } })))
      .toBe('Ravi · 11:05 am · Amount 5,000');
    expect(teamCellDetail(cell({ state: 'DONE', doneSource: 'SYSTEM', doneByName: null, comment: 'Photos on 2 of 2 deliveries' })))
      .toBe('Read by system · Photos on 2 of 2 deliveries');
    expect(teamCellDetail(cell({ state: 'NOT_RECEIVED', reasons: [{
      category: 'NOT_RECEIVED', label: 'Not received today', side: 'DEALERSHIP', remark: null, byActorId: 'pc', byName: 'Ravi',
      handledByActorId: null, handledByName: null, informedGroup: false, at: null,
    }] }))).toBe('Ravi: Not received today · WhatsApp group not informed');
    expect(teamCellDetail(cell({ progress: { state: 'PENDING', note: 'Photos on 1 of 3 deliveries', done: 1, total: 3 } })))
      .toBe('Photos on 1 of 3 deliveries');
  });
});
