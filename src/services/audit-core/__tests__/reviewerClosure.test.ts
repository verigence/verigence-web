import { describe, expect, it } from 'vitest';

import {
  incompleteAdded, initialChoices, recheckBeforeClosing, standingCounts, unansweredItems, undecidedItems,
  type ClosureItem,
} from '../reviewerClosure';

const item = (key: string, prefilledAnswer?: string): ClosureItem => ({ key, kind: 'MISSING_DOCUMENT', label: key, prefilledAnswer });

describe('closing a journey needs an answer for every open item (product owner 2026-11-04)', () => {
  it('counts an item answered by a typed reason or an accepted claim, not by a short note', () => {
    const items = [item('document:rsa', 'Not mandatory: accepted by the Reviewer.'), item('finding:1'), item('task:2')];
    expect(unansweredItems(items, {}, 10).map((i) => i.key)).toEqual(['finding:1', 'task:2']);
    expect(unansweredItems(items, { 'finding:1': 'ok', 'task:2': 'Customer confirmed on call' }, 10).map((i) => i.key))
      .toEqual(['finding:1']);
    expect(unansweredItems(items, { 'finding:1': 'Discount approved by the GM', 'task:2': 'Customer confirmed on call' }, 10))
      .toEqual([]);
  });
});

describe('the list is read again just before closing (SHI-SS-261027-013, 2026-11-06)', () => {
  const answers = { 'finding:1': 'Discount approved by the GM' };
  const fresh = (items: ClosureItem[], extra: Partial<{ blockers: string[]; canClose: boolean }> = {}) => ({
    items, blockers: [], canClose: true, minAnswerLength: 10, ...extra,
  });

  it('names an item that opened while the form was open instead of sending a close the server refuses', () => {
    const reopened = { ...item('task:9'), kind: 'OPEN_TASK' as const, label: 'Fix pages that could not be processed' };
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1'), reopened]), answers))
      .toBe('An item opened while this form was open: Fix pages that could not be processed. Decide it below.');
  });

  it('sends the close when nothing new opened, or an item closed meanwhile', () => {
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1')]), answers)).toBeUndefined();
    expect(recheckBeforeClosing(['finding:1', 'task:2'], fresh([item('finding:1')]), answers)).toBeUndefined();
  });

  it('stops on a claim now waiting for a decision', () => {
    expect(recheckBeforeClosing(['finding:1'], fresh([item('finding:1')],
      { blockers: ['A claim is waiting.'], canClose: false }), answers)).toBe('A claim is waiting.');
  });
});

describe('each item is an observation with a severity, or justified as not one (2026-11-09)', () => {
  const finding: ClosureItem = { key: 'finding:1', kind: 'OPEN_FINDING', label: 'Deal below standard',
    suggestedSeverity: 'HIGH', suggestedStands: true };
  const claim: ClosureItem = { key: 'document:rsa', kind: 'MISSING_DOCUMENT', label: 'RSA Invoice',
    prefilledAnswer: 'Not mandatory: no RSA sold on this deal.', suggestedSeverity: 'MEDIUM', suggestedStands: false };
  const carried: ClosureItem = { key: 'task:3', kind: 'OPEN_TASK', label: 'Check the gate pass date',
    suggestedSeverity: 'MEDIUM', suggestedStands: true, previousDecision: { stands: true, severity: 'LOW', note: 'Seen' } };

  it('starts from what Audit Core suggests, or what the last closure kept', () => {
    const choices = initialChoices([finding, claim, carried]);
    expect(choices['finding:1']).toMatchObject({ stands: true, severity: 'HIGH' });
    expect(choices['document:rsa']).toMatchObject({ stands: false, severity: null });
    expect(choices['task:3']).toMatchObject({ stands: true, severity: 'LOW', note: 'Seen' });
    // The accepted claim answers on its own: nothing is left to decide.
    expect(undecidedItems([finding, claim, carried], choices, 10)).toEqual([]);
  });

  it('needs a justification of 10 characters for an item that is not an observation', () => {
    const choices = { 'finding:1': { stands: false, justification: 'ok' } };
    expect(undecidedItems([finding], choices, 10).map((i) => i.key)).toEqual(['finding:1']);
    expect(undecidedItems([finding], { 'finding:1': { stands: false, justification: 'CoD on file, concession' } }, 10))
      .toEqual([]);
    expect(undecidedItems([finding], { 'finding:1': { stands: true, severity: null } }, 10).map((i) => i.key))
      .toEqual(['finding:1']);
  });

  it('counts what will stand, added observations included, and flags an incomplete addition', () => {
    const choices = initialChoices([finding, claim, carried]);
    const added = [{ title: 'Customer signature missing on NDC', severity: 'MEDIUM' as const }];
    expect(standingCounts(choices, added)).toEqual({ HIGH: 1, MEDIUM: 1, LOW: 1 });
    expect(incompleteAdded([...added, { title: 'Hi', severity: 'LOW' }])).toBe(1);
  });
});
