import { describe, expect, it } from 'vitest';
import { SecurityLoginError, loginErrorMessage } from '../auth';

describe('sign-in message for paused access', () => {
  it("shows Security's reason instead of 'check your details'", () => {
    const reason = 'Your Verigence access is paused because approvals waiting with you passed the Monday 09:00 deadline. Ask SuperAdmin to restore it.';
    expect(loginErrorMessage(new SecurityLoginError(reason, 403, 'ACCESS_BLOCKED'))).toBe(reason);
  });

  it('still says access is paused when Security gives only the title', () => {
    expect(loginErrorMessage(new SecurityLoginError('Verigence access is paused', 403, 'ACCESS_BLOCKED')))
      .toBe('Your Verigence access is paused. Ask SuperAdmin to restore it.');
  });
});
