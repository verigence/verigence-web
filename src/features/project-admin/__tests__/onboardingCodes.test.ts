import { describe, expect, it } from 'vitest';

import { suggestedDealerCode } from '../onboardingCodes';

describe('dealer code suggestion', () => {
  it('matches the server rule: initials + OEM abbreviation', () => {
    expect(suggestedDealerCode('Aditya Motors', 'MAHINDRA')).toBe('AM-MAH');
    expect(suggestedDealerCode('Utkal Hyundai', 'HYUNDAI')).toBe('UH-HYU');
    expect(suggestedDealerCode('Shivnath Motors Pvt. Ltd.', 'MAHINDRA')).toBe('SM-MAH');
    expect(suggestedDealerCode('Premier', 'HYUNDAI')).toBe('PR-HYU');
  });

  it('shows an example until a name and OEM are known', () => {
    expect(suggestedDealerCode('', 'MAHINDRA')).toBe('e.g. AM-MAH');
    expect(suggestedDealerCode('Aditya Motors', undefined)).toBe('e.g. AM-MAH');
  });
});
