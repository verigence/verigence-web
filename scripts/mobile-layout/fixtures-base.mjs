// Shared constants for the mobile layout fixtures.
export const TENANT = 'tenant-mobile';
export const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const iso = (d = today, t = '10:15:00') => `${d}T${t}+05:30`;
export const outlets = [
  { dealerId: 'd1', dealerName: 'Aditya Hyundai Private Limited', outletId: 'o1', outletName: 'Aditya Hyundai, Tamando', outletClassification: 'MAIN' },
  { dealerId: 'd1', dealerName: 'Aditya Hyundai Private Limited', outletId: 'o2', outletName: 'Aditya Hyundai, Patia Satellite Showroom', outletClassification: 'SATELLITE' },
];
