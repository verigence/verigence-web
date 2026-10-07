import type {
  Employee,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  ExperienceInput,
  Gender,
  MissingDetail,
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
  district: string;
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
  district: '',
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
    district: e.district ?? '',
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
const normalisePan = (raw: string) => raw.trim().toUpperCase();
const isPan = (raw: string) => PAN.test(normalisePan(raw));

export function normaliseAadhaar(raw: string): string | null {
  const compact = raw.replace(/\s/g, '');
  return /^\d{12}$/.test(compact) ? compact : null;
}

const isPincode = (raw: string) => /^[1-9]\d{5}$/.test(raw.trim());

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
  if (clean(v.district).length > 80) e.district = 'Keep the district within 80 characters.';
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
    ['district', v.district],
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
  nullable('district', original.district, v.district);
  const pincode = v.pincode.trim() || null;
  if ((original.pincode ?? null) !== pincode) out.pincode = pincode;
  const years = v.totalExperienceYears.trim() ? Number(v.totalExperienceYears) : null;
  if ((original.totalExperienceYears ?? null) !== years) out.total_experience_years = years;
  nullable('emergency_contact_name', original.emergencyContactName, v.emergencyContactName);
  nullable('emergency_contact_address', original.emergencyContactAddress, v.emergencyContactAddress);
  const emergency = v.emergencyContactNumber.trim() ? normaliseMobile(v.emergencyContactNumber) : null;
  if ((original.emergencyContactNumber ?? null) !== emergency) out.emergency_contact_number = emergency;
  if ((original.dateOfJoining ?? '') !== v.dateOfJoining) out.date_of_joining = v.dateOfJoining || null;
  if (v.pan.trim()) out.pan = normalisePan(v.pan);
  const aadhaar = v.aadhaar.trim() ? normaliseAadhaar(v.aadhaar) : null;
  if (aadhaar) out.aadhaar = aadhaar;
  return out as EmployeeUpdateInput;
}

export interface SelfFormValues {
  gender: '' | Gender;
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
    gender: e.gender ?? '',
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
  if ((original.gender ?? '') !== v.gender) out.gender = v.gender || null;
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
  university: string;
  college: string;
}

export const emptyQualification: QualificationFormValues = {
  degreeCode: '',
  degreeOther: '',
  percentage: '',
  yearOfPassing: '',
  university: '',
  college: '',
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
  // University and college are expected but may be left empty; they are then listed as pending.
  if (clean(v.university).length > 150) e.university = 'Keep the university within 150 characters.';
  if (clean(v.college).length > 150) e.college = 'Keep the college within 150 characters.';
  return e;
}

export function toQualificationInput(v: QualificationFormValues): QualificationInput {
  return {
    degree_code: v.degreeCode,
    degree_other: v.degreeCode === 'OTHER' ? clean(v.degreeOther) : null,
    percentage: Number(v.percentage),
    year_of_passing: Number(v.yearOfPassing),
    university: clean(v.university) || null,
    college: clean(v.college) || null,
  };
}

/**
 * What the HR service will most likely list as "pending details" for a record about to be created.
 * A preview for the review step only; after saving, the service's own list is what is shown.
 */
export function previewMissingDetails(
  v: EmployeeFormValues,
  qualifications: QualificationInput[],
  salaryEntered: boolean,
): MissingDetail[] {
  const out: MissingDetail[] = [];
  if (!clean(v.state)) out.push('STATE');
  if (!clean(v.district)) out.push('DISTRICT');
  if (!v.pincode.trim()) out.push('PINCODE');
  if (!clean(v.emergencyContactName) || !v.emergencyContactNumber.trim()) out.push('EMERGENCY_CONTACT');
  if (!v.totalExperienceYears.trim()) out.push('EXPERIENCE');
  if (qualifications.length === 0) out.push('QUALIFICATION');
  if (qualifications.length === 0 || qualifications.some((q) => !q.university || !q.college)) out.push('UNIVERSITY_COLLEGE');
  if (!salaryEntered) out.push('SALARY');
  return out;
}

export interface ExperienceFormValues {
  company: string;
  location: string;
  designation: string;
  fromDate: string;
  toDate: string;
  description: string;
}

export const emptyExperience: ExperienceFormValues = {
  company: '',
  location: '',
  designation: '',
  fromDate: '',
  toDate: '',
  description: '',
};

/** Today as YYYY-MM-DD in the browser's own calendar (what a date input uses for its max). */
export function isoToday(today: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Mirrors the service: company 2-120, designation 2-80, location 80, note 500, to-date not before from-date and not in the future. */
export function validateExperience(v: ExperienceFormValues, today: Date = new Date()) {
  const e: Partial<Record<keyof ExperienceFormValues, string>> = {};
  const company = clean(v.company);
  if (company.length < 2 || company.length > 120) e.company = 'Enter the company name (2 to 120 characters).';
  if (clean(v.location).length > 80) e.location = 'Keep the location within 80 characters.';
  const designation = clean(v.designation);
  if (designation.length < 2 || designation.length > 80) e.designation = 'Enter your designation (2 to 80 characters).';
  if (v.description.trim().length > 500) e.description = 'Keep the note within 500 characters.';
  const todayText = isoToday(today);
  if (!isRealDate(v.fromDate)) e.fromDate = 'Choose the date you joined.';
  else if (v.fromDate.trim() > todayText) e.fromDate = 'The joining date cannot be in the future.';
  if (!isRealDate(v.toDate)) e.toDate = 'Choose the date you left.';
  else if (v.toDate.trim() > todayText) e.toDate = 'The leaving date cannot be in the future.';
  else if (!e.fromDate && v.toDate.trim() < v.fromDate.trim()) e.toDate = 'The leaving date cannot be before the joining date.';
  return e;
}

export function toExperienceInput(v: ExperienceFormValues): ExperienceInput {
  return {
    company: clean(v.company),
    location: clean(v.location) || null,
    designation: clean(v.designation),
    from_date: v.fromDate.trim(),
    to_date: v.toDate.trim(),
    description: v.description.trim() || null,
  };
}
