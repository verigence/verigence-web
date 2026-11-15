import { describe, expect, it } from 'vitest';

import { readAppSignInRequest, returnUrl } from '../appSignIn';

const challenge = 'a'.repeat(43);
const state = 'b'.repeat(24);

describe('signing in to SevaSutra from the Verigence app', () => {
  it('accepts a request for SevaSutra on its own addresses only', () => {
    const ok = readAppSignInRequest(new URLSearchParams({ client: 'sevasutra', challenge, state, host: 'shree.sevasutra.jbrconsulting.in' }));
    expect(ok).toEqual({ client: 'sevasutra', challenge, state, host: 'shree.sevasutra.jbrconsulting.in' });
    expect(readAppSignInRequest(new URLSearchParams({ client: 'sevasutra', challenge, state, host: 'sevasutra.jbrconsulting.in.evil.com' }))).toBeNull();
    expect(readAppSignInRequest(new URLSearchParams({ client: 'other', challenge, state, host: 'sevasutra.jbrconsulting.in' }))).toBeNull();
    expect(readAppSignInRequest(new URLSearchParams({ client: 'sevasutra', challenge: 'short', state, host: 'sevasutra.jbrconsulting.in' }))).toBeNull();
  });

  it('hands the code back to the SevaSutra app', () => {
    const request = readAppSignInRequest(new URLSearchParams({ client: 'sevasutra', challenge, state, host: 'sevasutra.jbrconsulting.in' }))!;
    expect(returnUrl(request, { code: 'c0de' })).toBe(`sevasutra://sso?state=${state}&host=sevasutra.jbrconsulting.in&code=c0de`);
    expect(returnUrl(request, { error: 'cancelled' })).toContain('error=cancelled');
  });
});
