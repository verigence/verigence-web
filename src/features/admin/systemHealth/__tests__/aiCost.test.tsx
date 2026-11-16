import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AiCostTab from '../AiCostTab';
import { calls, costPerJourney, inr, share, typeLabel, usd } from '../aiCostLogic';
import type { AiCostFigures, AiCostProject, SystemHealthAiCost } from '../../../../services/audit-core/systemHealth';

const figures = (over: Partial<AiCostFigures> = {}): AiCostFigures => ({
  costUsd: 0, extractionUsd: 0, classificationUsd: 0, costFromTokensUsd: 0, reads: 0, classifications: 0,
  failedCalls: 0, callsWithoutCost: 0, promptTokens: 0, outputTokens: 0, ...over,
});

describe('AI cost helpers', () => {
  it('writes dollars to the cent, and to four places under a dollar', () => {
    expect(usd(114.857)).toBe('$114.86');
    expect(usd(1234.5)).toBe('$1,234.50');
    expect(usd(0.00524)).toBe('$0.0052');
    expect(usd(0)).toBe('$0.00');
    expect(usd(null)).toBe('—');
  });

  it('writes the approximate rupee figure at the given rate', () => {
    expect(inr(115, 94)).toBe('₹10,810');
    expect(inr(0.08, 94)).toBe('₹7.52');
    expect(inr(null, 94)).toBe('—');
  });

  it('labels a document type and a share', () => {
    expect(typeLabel('customer_ledger')).toBe('Customer ledger');
    expect(typeLabel('')).toBe('Unknown');
    expect(share(25, 100)).toBe('25.0%');
    expect(share(1, 0)).toBe('—');
  });

  it('counts calls and the cost of one Journey across Projects', () => {
    expect(calls(figures({ reads: 100, classifications: 110 }))).toBe(210);
    const project = (over: Partial<AiCostProject>): AiCostProject => ({
      ...figures(), tenantId: 't', projectName: 'p', projectStatus: 'ACTIVE', journeysWithUploads: 0, costPerJourneyUsd: null, ...over,
    });
    expect(costPerJourney([project({ costUsd: 9, journeysWithUploads: 90 }), project({ costUsd: 1, journeysWithUploads: 10 })])).toBeCloseTo(0.1);
    expect(costPerJourney([project({ costUsd: 1 })])).toBeNull();
  });
});

const sample: SystemHealthAiCost = {
  generatedAtUtc: '2026-11-16T17:00:00Z', available: true, error: null, days: 30, firstDay: '2026-10-18',
  timezone: 'Asia/Kolkata', currency: 'USD', usdInr: 94, tenantId: null,
  projectOptions: [{ tenantId: 't1', projectName: 'Mahindra Orissa', projectStatus: 'ACTIVE' }],
  prices: [{ model: 'gemini-3-flash-preview', tier: 'STANDARD', inputPerMTok: 0.5, outputPerMTok: 3 }],
  classificationRecordedSinceUtc: '2026-11-16T18:00:00Z',
  totals: figures({ costUsd: 115.24, extractionUsd: 115.24, costFromTokensUsd: 114.1, reads: 23474, classifications: 24170, failedCalls: 615, callsWithoutCost: 24170 }),
  today: { date: '2026-11-16', ...figures({ costUsd: 12.5, extractionUsd: 12.5, reads: 2397, classifications: 2441 }) },
  month: { month: '2026-11', coveredFromFirst: true, costUsd: 80.32, completeDays: 15, daysInMonth: 30, projectedUsd: 135.6 },
  daily: [
    { date: '2026-11-15', ...figures({ costUsd: 0.52, extractionUsd: 0.52, reads: 103, classifications: 103 }) },
    { date: '2026-11-16', ...figures({ costUsd: 12.5, extractionUsd: 12.5, reads: 2397, classifications: 2441 }) },
  ],
  projects: [{
    ...figures({ costUsd: 114.86, extractionUsd: 114.86, reads: 23214, classifications: 23734 }),
    tenantId: 't1', projectName: 'Mahindra Orissa', projectStatus: 'ACTIVE', journeysWithUploads: 1806, costPerJourneyUsd: 0.0636,
  }],
  documentTypes: [
    { documentTypeKey: 'booking_form', ...figures({ costUsd: 12.9, extractionUsd: 12.9, reads: 2026, failedCalls: 7 }), costPerReadUsd: 0.00637 },
  ],
  notes: ['List prices in US dollars, before taxes: what the calls cost, not the provider\'s invoice.',
    '24,170 calls have no cost: sorting (classification) calls made before their tokens began to be kept, and failed reads that kept nothing. They are counted, not estimated.'],
};

function render(data: SystemHealthAiCost) {
  const client = new QueryClient();
  client.setQueryData(['admin', 'system-health', 'ai-cost', 30, ''], data);
  return renderToString(<QueryClientProvider client={client}><AiCostTab accessToken="t" /></QueryClientProvider>);
}

describe('AI cost tab', () => {
  it('shows the total, today, the month, each Project and each document type', () => {
    const html = render(sample);
    for (const text of ['$115.24', '₹10,833', 'This month so far', '$80.32', '$135.60', '15 complete days',
      'Mahindra Orissa', '1,806', '$0.0636', 'Booking form', '$0.0064', 'AI cost per day', 'Reading (extraction)',
      'Sorting (classification)', 'gemini-3-flash-preview', 'counted, not estimated']) {
      expect(html).toContain(text);
    }
  });

  it('says so when Document Intelligence could not be asked, instead of showing zero spend as fact', () => {
    const html = render({
      ...sample, available: false, error: 'Document Intelligence answered HTTP 404.', totals: figures(), today: null,
      daily: [], projects: [], documentTypes: [], month: { ...sample.month, costUsd: 0, projectedUsd: null },
    });
    expect(html).toContain('could not be asked for its costs');
    expect(html).toContain('HTTP 404');
    expect(html).toContain('empty, not zero spend');
  });
});
