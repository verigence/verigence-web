import { describe, expect, it } from 'vitest';

import type { Employee } from '../../../services/hr/employees';
import {
  buildCreatePayload,
  buildSelfPayload,
  buildUpdatePayload,
  emptyEmployeeForm,
  formFromEmployee,
  normaliseAadhaar,
  normaliseMobile,
  selfFormFromEmployee,
  toQualificationInput,
  validateEmployeeForm,
  validateQualification,
  validateSelfForm,
} from '../employeeValidation';

const employee: Employee = {
  employeeId: 'e1',
  employeeCode: 'JBR001',
  fullName: 'Asha Rao',
  dateOfBirth: '1995-04-02',
  gender: 'FEMALE',
  mobile: '9876543210',
  personalEmail: 'asha@example.com',
  secondaryEmail: null,
  qualification: 'B Com',
  department: 'PC',
  designationCode: null,
  designation: null,
  address: '12 Main Road',
  state: 'Odisha',
  pincode: '751001',
  totalExperienceYears: 3.5,
  emergencyContactName: 'Ravi Rao',
  emergencyContactNumber: '9123456780',
  emergencyContactAddress: null,
  hasPhoto: false,
  dateOfJoining: '2024-01-10',
  employmentStatus: 'ACTIVE',
  loginStatus: 'CREATED',
  loginErrorCode: null,
  panMasked: 'XXXXX1234F',
  aadhaarMasked: null,
  dataFlags: ['AADHAAR_MISSING'],
};

const valid = {
  ...emptyEmployeeForm,
  employeeCode: 'jbr033',
  fullName: '  Asha   Rao ',
  personalEmail: 'Asha@Example.com ',
  mobile: '+91 98765 43210',
};

describe('mobile and Aadhaar normalisation', () => {
  it('accepts the usual ways of writing an Indian mobile', () => {
    expect(normaliseMobile('98765 43210')).toBe('9876543210');
    expect(normaliseMobile('+91 9876543210')).toBe('9876543210');
    expect(normaliseMobile('09876543210')).toBe('9876543210');
  });
  it('rejects numbers that are not Indian mobiles', () => {
    expect(normaliseMobile('1234567890')).toBeNull();
    expect(normaliseMobile('98765')).toBeNull();
  });
  it('needs exactly 12 digits for Aadhaar', () => {
    expect(normaliseAadhaar('1234 5678 9012')).toBe('123456789012');
    expect(normaliseAadhaar('12345678901')).toBeNull();
    expect(normaliseAadhaar('1234-5678-9012')).toBeNull();
  });
});

describe('validateEmployeeForm', () => {
  it('passes a minimal valid creation', () => {
    expect(validateEmployeeForm(valid, 'create')).toEqual({});
  });
  it('does not block a missing PAN or Aadhaar, but rejects a malformed one', () => {
    expect(validateEmployeeForm(valid, 'create').pan).toBeUndefined();
    expect(validateEmployeeForm({ ...valid, pan: 'ABC' }, 'create').pan).toBeTruthy();
    expect(validateEmployeeForm({ ...valid, aadhaar: '123' }, 'create').aadhaar).toBeTruthy();
    expect(validateEmployeeForm({ ...valid, pan: 'abcde1234f' }, 'create').pan).toBeUndefined();
  });
  it('requires a valid mobile only when a login will be created', () => {
    const noMobile = { ...valid, mobile: '' };
    expect(validateEmployeeForm(noMobile, 'create').mobile).toBeTruthy();
    expect(validateEmployeeForm({ ...noMobile, createLogin: false }, 'create').mobile).toBeUndefined();
  });
  it('checks pincode, experience and dates', () => {
    const errors = validateEmployeeForm(
      { ...valid, pincode: '051001', totalExperienceYears: '61', dateOfBirth: '2999-01-01' },
      'create',
    );
    expect(errors.pincode).toBeTruthy();
    expect(errors.totalExperienceYears).toBeTruthy();
    expect(errors.dateOfBirth).toBeTruthy();
  });
  it('does not ask for the employee code when editing', () => {
    expect(validateEmployeeForm({ ...valid, employeeCode: '' }, 'edit').employeeCode).toBeUndefined();
  });
});

describe('buildCreatePayload', () => {
  it('normalises, omits empty fields and keeps the login switch', () => {
    const payload = buildCreatePayload({ ...valid, pan: 'abcde1234f', state: 'Odisha' }, []);
    expect(payload).toEqual({
      employee_code: 'JBR033',
      full_name: 'Asha Rao',
      personal_email: 'asha@example.com',
      mobile: '9876543210',
      state: 'Odisha',
      pan: 'ABCDE1234F',
      create_login: true,
    });
  });
  it('carries qualifications', () => {
    const q = toQualificationInput({ degreeCode: 'BCOM', degreeOther: '', percentage: '72.5', yearOfPassing: '2016' });
    expect(buildCreatePayload(valid, [q]).qualifications).toEqual([
      { degree_code: 'BCOM', degree_other: null, percentage: 72.5, year_of_passing: 2016 },
    ]);
  });
});

describe('buildUpdatePayload', () => {
  it('sends nothing for an untouched record', () => {
    expect(buildUpdatePayload(employee, formFromEmployee(employee))).toEqual({});
  });
  it('sends only the fields that changed and clears a blanked one', () => {
    const form = { ...formFromEmployee(employee), department: 'RM', address: '', designationCode: 'AUDITOR' };
    expect(buildUpdatePayload(employee, form)).toEqual({
      department: 'RM',
      address: null,
      designation_code: 'AUDITOR',
    });
  });
  it('sends PAN only when a new one is typed', () => {
    const form = { ...formFromEmployee(employee), pan: ' abcde1234f ' };
    expect(buildUpdatePayload(employee, form)).toEqual({ pan: 'ABCDE1234F' });
  });
});

describe('self service form', () => {
  it('only offers the fields an employee may change', () => {
    expect(Object.keys(selfFormFromEmployee(employee)).sort()).toEqual([
      'address',
      'emergencyContactAddress',
      'emergencyContactName',
      'emergencyContactNumber',
      'pincode',
      'secondaryEmail',
      'state',
    ]);
  });
  it('sends nothing when unchanged and only the edit otherwise', () => {
    const form = selfFormFromEmployee(employee);
    expect(buildSelfPayload(employee, form)).toEqual({});
    expect(buildSelfPayload(employee, { ...form, pincode: '751002' })).toEqual({ pincode: '751002' });
  });
  it('validates', () => {
    const form = selfFormFromEmployee(employee);
    expect(validateSelfForm({ ...form, pincode: '12', secondaryEmail: 'x', emergencyContactNumber: '1' })).toEqual({
      pincode: expect.any(String),
      secondaryEmail: expect.any(String),
      emergencyContactNumber: expect.any(String),
    });
  });
});

describe('validateQualification', () => {
  const today = new Date('2026-10-04T00:00:00Z');
  it('accepts a good row', () => {
    expect(validateQualification({ degreeCode: 'BCOM', degreeOther: '', percentage: '72.5', yearOfPassing: '2016' }, today)).toEqual({});
  });
  it('needs a name for Other, sane marks and a past year', () => {
    const e = validateQualification({ degreeCode: 'OTHER', degreeOther: '', percentage: '101', yearOfPassing: '2099' }, today);
    expect(e.degreeOther).toBeTruthy();
    expect(e.percentage).toBeTruthy();
    expect(e.yearOfPassing).toBeTruthy();
  });
});
