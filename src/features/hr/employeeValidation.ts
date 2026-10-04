import type {
  Employee,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  Gender,
  QualificationInput,
  SelfUpdateInput,
} from '../../services/hr/employees';

/**
 * Form-side checks that mirror the HR service's own rules, so a mistake is caught before the
 * request. The service re-validates everything; nothing here is a security control.
 */

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface EmployeeFormValues {
  employeeCode: string;
  fullName: string;
  personalEmail: string;
  mobile: string;
  dateOfBirth: string;
  gender: '' | Gender;
  qualification: string;
  department: string;
  designationCode: string;
  employmentStatus: string;
  address: string;
  state: string;
  pincode: string;
  totalExperienceYears: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactAddress: string;
  dateOfJoining: string;
  pan: string;
  aadhaar: string;
  createLogin: boolean;
}

export type FormErrors = Partial<Record<keyof EmployeeFormValues | 'qualifications', string>>;

export const emptyEmployeeForm: EmployeeFormValues = {
  employeeCode: '',
  fullName: '',
  personalEmail: '',
  mobile: '',
  dateOfBirth: '',
  gender: '',
  qualification: '',
  department: '',
  designationCode: '',
  employmentStatus: 'ACTIVE',
  address: '',
  state: '',
  pincode: '',
  totalExperienceYears: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  emergencyContactAddress: '',
  dateOfJoining: '',
  pan: '',
  aadhaar: '',
  createLogin: true,
};

export function formFromEmployee(e: Employee): EmployeeFormValues {
  return {
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    personalEmail: e.personalEmail,
    mobile: e.mobile ?? '',
    dateOfBirth: e.dateOfBirth ?? '',
    gender: e.gender ?? '',
    qualification: e.qualification ?? '',
    department: e.department ?? '',
    designationCode: e.designationCode ?? '',
    employmentStatus: e.employmentStatus,
    address: e.address ?? '',
    state: e.state ?? '',
    pincode: e.pincode ?? '',
    totalExperienceYears: e.totalExperienceYears === null ? '' : String(e.totalExperienceYears),
    emergencyContactName: e.emergencyContactName ?? '',
    emergencyContactNumber: e.emergencyContactNumber ?? '',
    emergencyContactAddress: e.emergencyContactAddress ?? '',
    dateOfJoining: e.dateOfJoining ?? '',
    // The protected numbers are never sent back to the browser; blank means "leave as it is".
    pan: '',
    aadhaar: '',
    createLogin: false,
  };
}

/** The 10 digits of an Indian mobile number, or null when it is not one. */
export function normaliseMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 && '6789'.includes(digits[0]) ? digits : null;
}

export const isEmail = (raw: string) => {
  const v = raw.trim().toLowerCase();
  return EMAIL.test(v) && v.length <= 320;
};
export const normalisePan = (raw: string) => raw.trim().toUpperCase();
export const isPan = (raw: string) => PAN.test(normalisePan(raw));

export function normaliseAadhaar(raw: string): string | null {
  const compact = raw.replace(/\s/g, '');
  return /^\d{12}$/.test(compact) ? compact : null;
}

export const isPincode = (raw: string) => /^[1-9]\d{5}$/.test(raw.trim());

const clean = (v: string) => v.split(/\s+/).filter(Boolean).join(' ');

export function validateEmployeeForm(
  v: EmployeeFormValues,
  mode: 'create' | 'edit',
  today: Date = new Date(),
): FormErrors {
  const e: FormErrors = {};
  if (mode === 'create') {
    if (!/^[A-Za-z0-9-]{2,20}$/.test(v.employeeCode.trim())) {
      e.employeeCode = 'Use 2–20 letters, digits or hyphens (for example JBR033).';
    }
  }
  if (clean(v.fullName).length < 2) e.fullName = 'Enter the full name.';
  if (!isEmail(v.personalEmail)) e.personalEmail = 'Enter a valid email address.';
  if (v.mobile.trim() && !normaliseMobile(v.mobile)) e.mobile = 'Enter a valid 10-digit Indian mobile number.';
  if (v.dateOfBirth) {
    const dob = new Date(`${v.dateOfBirth}T00:00:00`);
    if (Number.isNaN(dob.getTime()) || dob >= today) e.dateOfBirth = 'Date of birth must be in the past.';
  }
  if (v.dateOfJoining && Number.isNaN(new Date(`${v.dateOfJoining}T00:00:00`).getTime())) {
    e.dateOfJoining = 'Enter a valid date.';
  }
  if (v.pincode.trim() && !isPincode(v.pincode)) e.pincode = 'Pincode must be 6 digits and cannot start with 0.';
  if (v.totalExperienceYears.trim()) {
    const years = Number(v.totalExperienceYears);
    if (!Number.isFinite(years) || years < 0 || years > 60) e.totalExperienceYears = 'Enter years between 0 and 60.';
    else if (Math.round(years * 10) / 10 !== years) e.totalExperienceYears = 'Use at most one decimal place.';
  }
  if (v.emergencyContactNumber.trim() && !normaliseMobile(v.emergencyContactNumber)) {
    e.emergencyContactNumber = 'Enter a valid 10-digit Indian mobile number.';
  }
  // A missing or repeated PAN is allowed (HR fixes it later); a malformed one is not.
  if (v.pan.trim() && !isPan(v.pan)) e.pan = 'PAN looks like ABCDE1234F.';
  if (v.aadhaar.trim() && !normaliseAadhaar(v.aadhaar)) e.aadhaar = 'Aadhaar must be exactly 12 digits.';
  if (mode === 'create' && v.createLogin && !normaliseMobile(v.mobile)) {
    e.mobile = e.mobile ?? 'A valid mobile number is needed to create the Verigence login.';
  }
  return e;
}

const orUndefined = (s: string) => (clean(s) ? clean(s) : undefined);

export function buildCreatePayload(
  v: EmployeeFormValues,
  qualifications: QualificationInput[],
): EmployeeCreateInput {
  const payload: EmployeeCreateInput = {
    employee_code: v.employeeCode.trim().toUpperCase(),
    full_name: clean(v.fullName),
    personal_email: v.personalEmail.trim().toLowerCase(),
    create_login: v.createLogin,
  };
  const mobile = v.mobile.trim() ? normaliseMobile(v.mobile) : null;
  if (mobile) payload.mobile = mobile;
  if (v.dateOfBirth) payload.date_of_birth = v.dateOfBirth;
  if (v.gender) payload.gender = v.gender;
  const text: Array<[keyof EmployeeCreateInput, string]> = [
    ['qualification', v.qualification],
    ['department', v.department],
    ['address', v.address],
    ['state', v.state],
    ['emergency_contact_name', v.emergencyContactName],
    ['emergency_contact_address', v.emergencyContactAddress],
  ];
  for (const [key, value] of text) {
    const cleaned = orUndefined(value);
    if (cleaned) (payload as unknown as Record<string, unknown>)[key] = cleaned;
  }
  if (v.pincode.trim()) payload.pincode = v.pincode.trim();
  if (v.totalExperienceYears.trim()) payload.total_experience_years = Number(v.totalExperienceYears);
  const emergency = v.emergencyContactNumber.trim() ? normaliseMobile(v.emergencyContactNumber) : null;
  if (emergency) payload.emergency_contact_number = emergency;
  if (v.dateOfJoining) payload.date_of_joining = v.dateOfJoining;
  if (v.pan.trim()) payload.pan = normalisePan(v.pan);
  const aadhaar = v.aadhaar.trim() ? normaliseAadhaar(v.aadhaar) : null;
  if (aadhaar) payload.aadhaar = aadhaar;
  if (qualifications.length) payload.qualifications = qualifications;
  return payload;
}

/** Only what changed, so an untouched record sends nothing and the audit log stays quiet. */
export function buildUpdatePayload(original: Employee, v: EmployeeFormValues): EmployeeUpdateInput {
  const out: Record<string, unknown> = {};
  const nullable = (key: string, before: string | null, after: string) => {
    const next = clean(after) || null;
    if ((before ?? null) !== next) out[key] = next;
  };
  if (clean(v.fullName) !== original.fullName) out.full_name = clean(v.fullName);
  const email = v.personalEmail.trim().toLowerCase();
  if (email !== original.personalEmail) out.personal_email = email;
  const mobile = v.mobile.trim() ? normaliseMobile(v.mobile) : null;
  if ((original.mobile ?? null) !== mobile) out.mobile = mobile;
  if ((original.dateOfBirth ?? '') !== v.dateOfBirth) out.date_of_birth = v.dateOfBirth || null;
  if ((original.gender ?? '') !== v.gender) out.gender = v.gender || null;
  nullable('qualification', original.qualification, v.qualification);
  nullable('department', original.department, v.department);
  if ((original.designationCode ?? '') !== v.designationCode) out.designation_code = v.designationCode || null;
  nullable('address', original.address, v.address);
  nullable('state', original.state, v.state);
  const pincode = v.pincode.trim() || null;
  if ((original.pincode ?? null) !== pincode) out.pincode = pincode;
  const years = v.totalExperienceYears.trim() ? Number(v.totalExperienceYears) : null;
  if ((original.totalExperienceYears ?? null) !== years) out.total_experience_years = years;
  nullable('emergency_contact_name', original.emergencyContactName, v.emergencyContactName);
  nullable('emergency_contact_address', original.emergencyContactAddress, v.emergencyContactAddress);
  const emergency = v.emergencyContactNumber.trim() ? normaliseMobile(v.emergencyContactNumber) : null;
  if ((original.emergencyContactNumber ?? null) !== emergency) out.emergency_contact_number = emergency;
  if ((original.dateOfJoining ?? '') !== v.dateOfJoining) out.date_of_joining = v.dateOfJoining || null;
  if (v.employmentStatus && v.employmentStatus !== original.employmentStatus) out.employment_status = v.employmentStatus;
  if (v.pan.trim()) out.pan = normalisePan(v.pan);
  const aadhaar = v.aadhaar.trim() ? normaliseAadhaar(v.aadhaar) : null;
  if (aadhaar) out.aadhaar = aadhaar;
  return out as EmployeeUpdateInput;
}

export interface SelfFormValues {
  address: string;
  state: string;
  pincode: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactAddress: string;
  secondaryEmail: string;
}

export function selfFormFromEmployee(e: Employee): SelfFormValues {
  return {
    address: e.address ?? '',
    state: e.state ?? '',
    pincode: e.pincode ?? '',
    emergencyContactName: e.emergencyContactName ?? '',
    emergencyContactNumber: e.emergencyContactNumber ?? '',
    emergencyContactAddress: e.emergencyContactAddress ?? '',
    secondaryEmail: e.secondaryEmail ?? '',
  };
}

export function validateSelfForm(v: SelfFormValues): Partial<Record<keyof SelfFormValues, string>> {
  const e: Partial<Record<keyof SelfFormValues, string>> = {};
  if (v.pincode.trim() && !isPincode(v.pincode)) e.pincode = 'Pincode must be 6 digits and cannot start with 0.';
  if (v.emergencyContactNumber.trim() && !normaliseMobile(v.emergencyContactNumber)) {
    e.emergencyContactNumber = 'Enter a valid 10-digit Indian mobile number.';
  }
  if (v.secondaryEmail.trim() && !isEmail(v.secondaryEmail)) e.secondaryEmail = 'Enter a valid email address.';
  return e;
}

export function buildSelfPayload(original: Employee, v: SelfFormValues): SelfUpdateInput {
  const out: Record<string, unknown> = {};
  const compare = (key: string, before: string | null, after: string | null) => {
    if ((before ?? null) !== after) out[key] = after;
  };
  compare('address', original.address, clean(v.address) || null);
  compare('state', original.state, v.state.trim() || null);
  compare('pincode', original.pincode, v.pincode.trim() || null);
  compare('emergency_contact_name', original.emergencyContactName, clean(v.emergencyContactName) || null);
  compare(
    'emergency_contact_number',
    original.emergencyContactNumber,
    v.emergencyContactNumber.trim() ? normaliseMobile(v.emergencyContactNumber) : null,
  );
  compare('emergency_contact_address', original.emergencyContactAddress, clean(v.emergencyContactAddress) || null);
  compare('secondary_email', original.secondaryEmail, v.secondaryEmail.trim().toLowerCase() || null);
  return out as SelfUpdateInput;
}

export interface QualificationFormValues {
  degreeCode: string;
  degreeOther: string;
  percentage: string;
  yearOfPassing: string;
}

export const emptyQualification: QualificationFormValues = {
  degreeCode: '',
  degreeOther: '',
  percentage: '',
  yearOfPassing: '',
};

export function validateQualification(v: QualificationFormValues, today: Date = new Date()) {
  const e: Partial<Record<keyof QualificationFormValues, string>> = {};
  if (!v.degreeCode) e.degreeCode = 'Choose a degree.';
  if (v.degreeCode === 'OTHER' && !clean(v.degreeOther)) e.degreeOther = 'Type the name of the degree.';
  const pct = Number(v.percentage);
  if (!v.percentage.trim() || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    e.percentage = 'Enter marks between 0 and 100.';
  } else if (Math.round(pct * 100) / 100 !== pct) {
    e.percentage = 'Use at most two decimal places.';
  }
  const year = Number(v.yearOfPassing);
  if (!/^\d{4}$/.test(v.yearOfPassing.trim()) || year < 1950 || year > today.getFullYear()) {
    e.yearOfPassing = `Enter a year between 1950 and ${today.getFullYear()}.`;
  }
  return e;
}

export function toQualificationInput(v: QualificationFormValues): QualificationInput {
  return {
    degree_code: v.degreeCode,
    degree_other: v.degreeCode === 'OTHER' ? clean(v.degreeOther) : null,
    percentage: Number(v.percentage),
    year_of_passing: Number(v.yearOfPassing),
  };
}
