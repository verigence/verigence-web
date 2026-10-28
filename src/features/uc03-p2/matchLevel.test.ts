import { describe, expect, it } from 'vitest';

import { matchLevelText } from './matchLevel';

describe('matchLevelText', () => {
  it('names the two levels', () => {
    expect(matchLevelText('HIGH')).toBe('High probability');
    expect(matchLevelText('PROBABLE')).toBe('Probable');
    expect(matchLevelText('MEDIUM')).toBe('Probable');
    expect(matchLevelText(null)).toBe('Probable');
  });
});
