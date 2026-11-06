import { describe, expect, it } from 'vitest';

import { fitWithin, imageProblem } from '../announcementImage';
import { validateMessage, type MessageForm } from '../announcementLogic';

describe('announcement pictures', () => {
  it('shrinks the longer side to 1600 and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('accepts only pictures, and GIFs within 2 MB', () => {
    expect(imageProblem({ type: 'image/png', size: 5_000_000 })).toBeNull();
    expect(imageProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/PNG/);
    expect(imageProblem({ type: 'application/pdf', size: 100 })).toMatch(/PNG/);
    expect(imageProblem({ type: 'image/gif', size: 3 * 1024 * 1024 })).toMatch(/2 MB/);
  });

  it('lets a picture stand in for the words', () => {
    const form: MessageForm = { kind: 'NOTICE', title: 'Diwali', body: '', audience: 'EVERYONE', people: [], from: '', until: '' };
    expect(validateMessage(form)).toMatch(/picture/);
    expect(validateMessage(form, true)).toBeNull();
  });
});
