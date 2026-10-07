/** The price master menu entries for the people who work in a project: they sit in the Audit group, the one that is drawn. */
export interface PriceMasterNavItem {
  to: string;
  label: string;
  mark: string;
}

export const priceMastersItem: PriceMasterNavItem = { to: '/price-masters', label: 'Price Masters', mark: 'PM' };
const priceMasterUploadItem: PriceMasterNavItem = { to: '/price-masters/upload', label: 'Upload Price Master', mark: 'UP' };

/** PC, TL and PM search the price masters; only TL and PM upload them. Anyone else sees neither. */
export function priceMasterNavItems(operatingRole: string): PriceMasterNavItem[] {
  if (operatingRole === 'TL' || operatingRole === 'PM') return [priceMastersItem, priceMasterUploadItem];
  if (operatingRole === 'PC') return [priceMastersItem];
  return [];
}
