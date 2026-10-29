/**
 * The Phase 1 screens are off for PC, TL and PM (product owner 2026-10-29):
 * no menu entry or link takes them to the old Task Queue or old journey
 * review screens, and the old addresses send them to Booking & Delivery.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { taskPlan } from '../features/uc03-p2/tasks/p2TaskPlan';
import type { P2Task } from '../services/audit-core/uc03P2';

const SRC = join(__dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('Phase 1 screens off for PC, TL and PM', () => {
  it('the old addresses go through LegacyScreen', () => {
    const app = read('App.tsx');
    for (const route of ['/reviews', '/duplicate-bookings', '/rule-catalog', '/audit/:journeyId', '/tl/cases/:journeyId/review']) {
      const line = app.split('\n').find((candidate) => candidate.includes(`path="${route}"`));
      expect(line, route).toContain('<LegacyScreen ');
    }
    expect(app).toMatch(/operatingRole === 'PC' \|\| operatingRole === 'TL' \|\| operatingRole === 'PM'\) \{\n\s+return <Navigate to=\{to\(journeyId\)\}/);
  });

  it('the shell has no old Task Queue entry for them', () => {
    const shell = read('layout/AppShell.tsx');
    expect(shell).not.toContain('reviewQueueItem');
    expect(shell).toContain("const legacyRoles: ShellRole[] = ['EXECUTIVE', 'TENANT_ADMIN', 'SUPER_ADMIN'];");
  });

  it('the Team Lead home and journey rows do not open the old screens', () => {
    expect(read('pages/TeamLeadDashboardPage.tsx')).not.toContain("'/reviews");
    expect(read('features/uc03-p2/bookings/JourneyRow.tsx')).not.toContain('/tl/cases/');
  });

  it('a Phase 1 task offers the old queue only to other roles', () => {
    const task = { source_system: 'LEGACY', journey_id: 'j1', legacy_queue_url: '/reviews' } as unknown as P2Task;
    for (const role of ['PC', 'TL', 'PM']) expect(taskPlan(task, role).secondary).toEqual([]);
    expect(taskPlan(task, 'EXECUTIVE').secondary.map((a) => a.label)).toEqual(['Open in old Task Queue']);
  });
});
