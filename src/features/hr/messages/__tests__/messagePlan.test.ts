import { describe, expect, it } from 'vitest';

import {
  countLabel,
  insertAtSelection,
  MASKED_PASSWORD,
  nothingWasSent,
  reasonLabel,
  renderPreview,
  summariseSend,
  toBatches,
  usedPlaceholders,
  validateWording,
} from '../messagePlan';
import { notFinishedIds, notSentIds, type RunState } from '../useSendRun';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i + 1}`);
const GENERAL = ['name', 'company', 'sign_in_link', 'app_link'];
const WELCOME = [...GENERAL, 'login_id', 'temp_password'];

describe('toBatches', () => {
  it('splits 7 people into groups of 5 and 2, in order', () => {
    expect(toBatches(ids(7))).toEqual([ids(5), ['id-6', 'id-7']]);
  });
  it('keeps 5 in one group and 6 in two', () => {
    expect(toBatches(ids(5))).toHaveLength(1);
    expect(toBatches(ids(6)).map((b) => b.length)).toEqual([5, 1]);
  });
  it('never makes a group larger than 5 and drops duplicates', () => {
    const groups = toBatches([...ids(12), 'id-1', 'id-2']);
    expect(groups.every((g) => g.length <= 5)).toBe(true);
    expect(groups.flat()).toHaveLength(12);
  });
  it('returns nothing for nobody', () => {
    expect(toBatches([])).toEqual([]);
  });
});

describe('insertAtSelection', () => {
  it('inserts at the caret', () => {
    expect(insertAtSelection('Dear ,', 5, 5, '{{name}}')).toEqual({ value: 'Dear {{name}},', caret: 13 });
  });
  it('replaces a selection', () => {
    expect(insertAtSelection('Dear XXX,', 5, 8, '{{name}}').value).toBe('Dear {{name}},');
  });
  it('appends when there is no caret, and clamps a bad one', () => {
    expect(insertAtSelection('Hi ', null, null, '{{name}}').value).toBe('Hi {{name}}');
    expect(insertAtSelection('Hi', 99, 120, '{{x}}').value).toBe('Hi{{x}}');
  });
});

describe('usedPlaceholders', () => {
  it('reads keys the way the service does, spaces allowed', () => {
    expect(usedPlaceholders('Hi {{ name }} {{name}} {{app_link}}').sort()).toEqual(['app_link', 'name']);
  });
});

describe('validateWording', () => {
  it('accepts the allowed placeholders', () => {
    expect(validateWording('GENERAL', 'Hello {{name}}', 'Dear {{name}}, see {{app_link}}', GENERAL)).toBeNull();
  });
  it('refuses empty text and unknown placeholders', () => {
    expect(validateWording('GENERAL', ' ', 'x', GENERAL)).toMatch(/cannot be empty/);
    expect(validateWording('GENERAL', 'Hi', 'Dear {{nme}}', GENERAL)).toMatch(/\{\{nme\}\}/);
  });
  it('refuses the password in a general message, and anywhere in a subject', () => {
    expect(validateWording('GENERAL', 'Hi', 'Pw {{temp_password}}', GENERAL)).toMatch(/not available/);
    expect(validateWording('WELCOME', 'Your {{temp_password}}', '{{login_id}} {{temp_password}}', WELCOME)).toMatch(/subject/);
  });
  it('needs the login in a welcome message', () => {
    expect(validateWording('WELCOME', 'Hi', 'Dear {{name}} {{login_id}}', WELCOME)).toMatch(/\{\{temp_password\}\}/);
    expect(validateWording('WELCOME', 'Hi', '{{login_id}} {{temp_password}}', WELCOME)).toBeNull();
  });
});

describe('renderPreview', () => {
  it('uses the name and never shows a password', () => {
    const out = renderPreview('Dear {{name}}, ID {{login_id}}, pw {{ temp_password }}', { fullName: 'Asha Rao' });
    expect(out).toContain('Dear Asha Rao');
    expect(out).toContain(`pw ${MASKED_PASSWORD}`);
    expect(out).not.toContain('{{');
  });
});

describe('results in plain words', () => {
  it('explains known codes and shows unknown ones as they are', () => {
    expect(reasonLabel('LOGIN_NOT_ACTIVE')).toMatch(/SuperAdmin/);
    expect(reasonLabel('SOMETHING_NEW')).toContain('SOMETHING_NEW');
    expect(reasonLabel(null)).toBe('');
  });
  it('counts statuses', () => {
    const r = (status: 'SENT' | 'SKIPPED' | 'FAILED') => ({ employeeId: 'x', name: null, status, code: null, message: null });
    expect(summariseSend([r('SENT'), r('SENT'), r('SKIPPED'), r('FAILED')])).toEqual({ sent: 2, skipped: 1, failed: 1 });
  });
  it('pluralises', () => {
    expect(countLabel(1, 'person', 'people')).toBe('1 person');
    expect(countLabel(7, 'person', 'people')).toBe('7 people');
  });
});

describe('nothingWasSent', () => {
  it('is certain only when the service refused before starting', () => {
    expect(nothingWasSent({ status: 422, code: 'MESSAGE_TEMPLATE_INVALID' })).toBe(true);
    expect(nothingWasSent({ status: 503, code: 'MESSAGE_CHANNEL_NOT_AVAILABLE' })).toBe(true);
    expect(nothingWasSent({ status: 503, code: 'HR_DEPENDENCY_UNAVAILABLE' })).toBe(false);
    expect(nothingWasSent({ code: 'WEB-HR-NETWORK' })).toBe(false);
    expect(nothingWasSent(new Error('x'))).toBe(false);
  });
});

describe('what was not sent', () => {
  const run: RunState = {
    template: 'GENERAL',
    channel: 'EMAIL',
    people: {},
    phase: 'failed',
    batches: [
      {
        ids: ['a', 'b'],
        status: 'done',
        results: [
          { employeeId: 'a', name: 'A', status: 'SENT', code: null, message: null },
          { employeeId: 'b', name: 'B', status: 'FAILED', code: 'MAIL_UNAVAILABLE', message: 'x' },
        ],
      },
      { ids: ['c', 'd'], status: 'failed', results: [], error: 'x', maybeSent: true },
      { ids: ['e'], status: 'waiting', results: [] },
    ],
  };
  it('lists people whose group did not finish', () => {
    expect(notFinishedIds(run)).toEqual(['c', 'd', 'e']);
  });
  it('also lists people who failed inside a finished group', () => {
    expect(notSentIds(run)).toEqual(['b', 'c', 'd', 'e']);
  });
});
