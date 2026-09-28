/** Same rule as Audit Core (onboarding_workbook.derive_dealer_code): the
 * dealership's initials plus the OEM abbreviation, e.g. Aditya Motors +
 * Mahindra = AM-MAH. Only a placeholder -- the server decides. */
const OEM_ABBREVIATIONS: Record<string, string> = {
  MAHINDRA: 'MAH', HYUNDAI: 'HYU', MARUTI: 'MAR', TATA_MOTORS: 'TAT', MERCEDES_BENZ: 'MB', BMW: 'BMW',
  SKODA: 'SKO', VOLKSWAGEN: 'VW', KIA: 'KIA', TOYOTA: 'TOY', HONDA: 'HON',
};
const NOISE = new Set(['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'INC', 'CO', 'COMPANY', 'AND', 'THE', 'OF']);

export function oemAbbreviation(oemCode: string): string {
  const code = oemCode.trim().toUpperCase();
  return OEM_ABBREVIATIONS[code] ?? code.replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

export function suggestedDealerCode(dealerName: string, oemCode?: string | null): string {
  if (!dealerName.trim() || !oemCode) return 'e.g. AM-MAH';
  const words = dealerName.toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word && !NOISE.has(word));
  const initials = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? 'D').slice(0, 2);
  return `${initials}-${oemAbbreviation(oemCode)}`;
}
