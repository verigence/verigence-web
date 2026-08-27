export interface BookingLocalOption {
  code: string;
  label: string;
}

// UC03 Booking Screen-2 uses a fixed operational vocabulary. Keep these finite
// key/value pairs in the Web bundle so opening a Booking never depends on a
// reference-master round trip. Audit Core still validates submitted codes.
export const BOOKING_DETAILS_LOCAL_MASTERS = {
  customerTypes: [
    { code: 'INDIVIDUAL', label: 'Individual' },
    { code: 'CORPORATE', label: 'Corporate' },
    { code: 'LEASE', label: 'Lease' },
    { code: 'CSD', label: 'CSD' },
    { code: 'BUSINESS', label: 'Business' },
  ],
  dealTypes: [
    { code: 'IN_SCOPE', label: 'In-Scope' },
    { code: 'OUT_OF_SCOPE', label: 'Out of Scope' },
    { code: 'MANAGEMENT_REFERRAL', label: 'Management Referral' },
    { code: 'OEM_REFERRAL', label: 'OEM Referral' },
  ],
  dealSources: [
    { code: 'WALK_IN', label: 'Walk-in' },
    { code: 'DIGITAL', label: 'Digital' },
    { code: 'INCOMING_CALL', label: 'Incoming Call' },
    { code: 'CRM', label: 'CRM' },
    { code: 'REFERRAL', label: 'Referral' },
    { code: 'FIELD_GENERATION', label: 'Field Generation' },
  ],
  leadSources: [
    { code: 'IN_HOUSE', label: 'In House' },
    { code: 'DSA', label: 'DSA' },
    { code: 'LEASING', label: 'Leasing' },
  ],
  territoryCategories: [
    { code: 'SAME_TERRITORY', label: 'Same Territory' },
    { code: 'OUT_OF_TERRITORY', label: 'Out of Territory' },
    { code: 'OUT_OF_STATE', label: 'Out of State' },
  ],
  registrationTypes: [
    { code: 'PERMANENT', label: 'Permanent' },
    { code: 'TEMPORARY', label: 'Temporary' },
    { code: 'BH_SERIES', label: 'BH Series' },
  ],
  registrationCategories: [
    { code: 'PRIVATE', label: 'Private' },
    { code: 'COMMERCIAL', label: 'Commercial' },
    { code: 'GOVERNMENT', label: 'Government' },
    { code: 'DIPLOMATIC', label: 'Diplomatic' },
  ],
  registrationStates: [
    { code: 'AN', label: 'Andaman and Nicobar Islands' },
    { code: 'AP', label: 'Andhra Pradesh' },
    { code: 'AR', label: 'Arunachal Pradesh' },
    { code: 'AS', label: 'Assam' },
    { code: 'BR', label: 'Bihar' },
    { code: 'CH', label: 'Chandigarh' },
    { code: 'CG', label: 'Chhattisgarh' },
    { code: 'DN', label: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: 'DL', label: 'Delhi' },
    { code: 'GA', label: 'Goa' },
    { code: 'GJ', label: 'Gujarat' },
    { code: 'HR', label: 'Haryana' },
    { code: 'HP', label: 'Himachal Pradesh' },
    { code: 'JK', label: 'Jammu and Kashmir' },
    { code: 'JH', label: 'Jharkhand' },
    { code: 'KA', label: 'Karnataka' },
    { code: 'KL', label: 'Kerala' },
    { code: 'LA', label: 'Ladakh' },
    { code: 'LD', label: 'Lakshadweep' },
    { code: 'MP', label: 'Madhya Pradesh' },
    { code: 'MH', label: 'Maharashtra' },
    { code: 'MN', label: 'Manipur' },
    { code: 'ML', label: 'Meghalaya' },
    { code: 'MZ', label: 'Mizoram' },
    { code: 'NL', label: 'Nagaland' },
    { code: 'OD', label: 'Odisha' },
    { code: 'PY', label: 'Puducherry' },
    { code: 'PB', label: 'Punjab' },
    { code: 'RJ', label: 'Rajasthan' },
    { code: 'SK', label: 'Sikkim' },
    { code: 'TN', label: 'Tamil Nadu' },
    { code: 'TS', label: 'Telangana' },
    { code: 'TR', label: 'Tripura' },
    { code: 'UP', label: 'Uttar Pradesh' },
    { code: 'UK', label: 'Uttarakhand' },
    { code: 'WB', label: 'West Bengal' },
    { code: 'OTHER', label: 'Other / Not Listed' },
  ],
  // District is project/outlet-derived on the backend. OTHER is deliberately
  // seeded for every Project and is therefore the only universal local value.
  districts: [
    { code: 'OTHER', label: 'Other / Not Listed' },
  ],
} satisfies Record<string, BookingLocalOption[]>;
