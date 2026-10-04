import { describe, expect, it } from 'vitest';

import { buildProposal, hasMidTemplate, isInBand, parseGross, pfIsOptional, validateProposal, type ProposalForm } from '../salaryRules';

const form = (over: Partial<ProposalForm> = {}): ProposalForm => ({
  employeeId: 'e1', gross: '30000', effectiveFrom: '2026-10-01', templateId: '', bandConfirmed: false, pfApplicable: true, note: '', ...over,
});

describe('the 21,001 to 24,999 band', () => {
  it('includes both edges and nothing outside them', () => {
    expect(isInBand('21001')).toBe(true);
    expect(isInBand('24999')).toBe(true);
    expect(isInBand('24999.99')).toBe(true);
    expect(isInBand('22000.50')).toBe(true);
    expect(isInBand('21000')).toBe(false);
    expect(isInBand('21000.99')).toBe(false);
    expect(isInBand('25000')).toBe(false);
    expect(isInBand('25000.01')).toBe(false);
  });

  it('needs a chosen template and an explicit tick', () => {
    expect(validateProposal(form({ gross: '22000' })).templateId).toBeTruthy();
    expect(validateProposal(form({ gross: '22000', templateId: 't1' })).bandConfirmed).toBeTruthy();
    expect(validateProposal(form({ gross: '22000', templateId: 't1', bandConfirmed: true }))).toEqual({});
  });

  it('asks for no choice when the band template exists, and sends no template or tick', () => {
    expect(hasMidTemplate([{ code: 'MID_21K_25K', active: true }])).toBe(true);
    expect(hasMidTemplate([{ code: 'MID_21K_25K', active: false }, { code: 'OTHER', active: true }])).toBe(false);
    expect(validateProposal(form({ gross: '22000' }), false)).toEqual({});
    expect(buildProposal(form({ gross: '22000', templateId: 't1', bandConfirmed: true }), false)).toEqual({
      employee_id: 'e1', gross_monthly: '22000', effective_from: '2026-10-01',
    });
  });

  it('treats 25,000 as an ordinary salary', () => {
    expect(validateProposal(form({ gross: '25000' }))).toEqual({});
  });

  it('does not ask outside the band', () => {
    expect(validateProposal(form({ gross: '18000' }))).toEqual({});
    expect(validateProposal(form({ gross: '40000' }))).toEqual({});
  });

  it('sends band_confirmed only when the person ticked it inside the band', () => {
    expect(buildProposal(form({ gross: '22000', templateId: 't1', bandConfirmed: true }))).toEqual({
      employee_id: 'e1', gross_monthly: '22000', effective_from: '2026-10-01', template_id: 't1', band_confirmed: true,
    });
    // A tick left over from an earlier amount is not sent for an amount outside the band.
    expect(buildProposal(form({ gross: '40000', bandConfirmed: true }))).not.toHaveProperty('band_confirmed');
    expect(buildProposal(form({ note: ' hello ' }))).toMatchObject({ gross_monthly: '30000', note: 'hello' });
  });
});

describe('the gross', () => {
  it('accepts digits with up to two decimals and strips commas', () => {
    expect(parseGross('30,000.50')).toEqual({ ok: true, value: '30000.50' });
    expect(parseGross(' 100 ')).toEqual({ ok: true, value: '100' });
  });

  it('rejects empty, zero, too precise, negative and over-limit amounts', () => {
    for (const bad of ['', '0', '0.00', '-5', '10.123', 'abc', '10000001', '123456789']) {
      expect(parseGross(bad).ok).toBe(false);
    }
    expect(parseGross('10000000').ok).toBe(true);
  });

  it('requires a person and an effective date', () => {
    const e = validateProposal(form({ employeeId: '', effectiveFrom: '' }));
    expect(e.employeeId).toBeTruthy();
    expect(e.effectiveFrom).toBeTruthy();
  });
});

describe('Provident Fund choice', () => {
  it('is offered only from a gross of 25,000', () => {
    expect(pfIsOptional('25000')).toBe(true);
    expect(pfIsOptional('25,000.50')).toBe(true);
    expect(pfIsOptional('100000')).toBe(true);
    expect(pfIsOptional('24999.99')).toBe(false);
    expect(pfIsOptional('')).toBe(false);
    expect(pfIsOptional('abc')).toBe(false);
  });

  it('sends pf_applicable only when unticked for a gross of 25,000 or more', () => {
    expect(buildProposal(form({ gross: '30000', pfApplicable: false }))).toHaveProperty('pf_applicable', false);
    expect(buildProposal(form({ gross: '30000', pfApplicable: true }))).not.toHaveProperty('pf_applicable');
    // An untick left over from a higher amount is not sent for a lower one.
    expect(buildProposal(form({ gross: '20000', pfApplicable: false }))).not.toHaveProperty('pf_applicable');
  });
});
