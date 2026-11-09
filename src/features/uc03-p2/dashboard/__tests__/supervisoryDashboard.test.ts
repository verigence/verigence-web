/**
 * The supervisory dashboard is the landing page of the Team Lead, the Project
 * Manager and the Executive (product owner 2026-11-09).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  dashboardEntryFor,
  focusCardsFor,
  homePathFor,
  scopeSummary,
  supervisoryRole,
} from '../supervisoryDashboard';

const SRC = join(__dirname, '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('landing by role', () => {
  it('Executive and PM land on the dashboard from /home', () => {
    expect(homePathFor('EXECUTIVE')).toBe('/dashboard');
    expect(homePathFor('PM')).toBe('/dashboard');
  });

  it('the other roles keep their landing', () => {
    expect(homePathFor('TL')).toBe('/p2/bookings');
    expect(homePathFor('PC')).toBe('/p2/home');
    expect(homePathFor('REVIEWER')).toBe('/p2/review');
    expect(homePathFor('CRM')).toBe('/dashboard');
    expect(homePathFor(undefined)).toBe('/dashboard');
  });

  it('/dashboard is the supervisory dashboard for TL, PM and Executive, not the Phase 1 Overview', () => {
    expect(dashboardEntryFor('TL')).toBe('supervisory');
    expect(dashboardEntryFor('PM')).toBe('supervisory');
    expect(dashboardEntryFor('EXECUTIVE')).toBe('supervisory');
    expect(dashboardEntryFor('PC')).toBe('pcHome');
    expect(dashboardEntryFor('CRM')).toBe('overview');
    expect(dashboardEntryFor('REVIEWER')).toBe('overview');
    expect(dashboardEntryFor(undefined)).toBe('overview');
  });

  it('App routes /home and /dashboard through these decisions', () => {
    const app = read('App.tsx');
    expect(app).toContain('const home = homePathFor(selectedProject?.operatingRole);');
    expect(app).toContain("const entry = dashboardEntryFor(selectedProject?.operatingRole);");
    expect(app).toContain("if (entry === 'supervisory') return <OperationalPage><SupervisoryDashboardPage /></OperationalPage>;");
    // The PM's own Booking & Delivery page stays.
    expect(app).toContain('path="/p2/bookings"');
  });

  it('only TL, PM and Executive are supervisory', () => {
    expect(['TL', 'PM', 'EXECUTIVE', 'PC', 'CRM', 'REVIEWER', undefined].map(supervisoryRole))
      .toEqual(['TL', 'PM', 'EXECUTIVE', null, null, null, null]);
  });
});

describe('focus cards', () => {
  it('each role gets only the places its menu opens', () => {
    expect(focusCardsFor('TL')).toEqual(['tasks', 'dailyOps', 'projectTracker']);
    expect(focusCardsFor('PM')).toEqual(['tasks', 'projectTracker']);
    // An Executive has no Booking & Delivery Task Queue: their tasks are in Task Manager.
    expect(focusCardsFor('EXECUTIVE')).toEqual(['projectTracker', 'taskManager']);
  });

  it('the menu gives each role the page its cards open', () => {
    const shell = read('layout/AppShell.tsx');
    const roles = (item: string) => {
      const block = shell.slice(shell.indexOf(`const ${item}: NavItem = {`));
      return block.slice(0, block.indexOf('};'));
    };
    expect(roles('p2TasksItem')).toContain("roles: ['PC', 'TL', 'PM', 'REVIEWER']");
    expect(roles('p2ProjectTrackerItem')).toContain("roles: ['TL', 'PM', 'EXECUTIVE']");
    expect(roles('taskManagerItem')).toContain("'EXECUTIVE'");
  });

  it('the dashboard names the role and never the Project', () => {
    const page = read('pages/SupervisoryDashboardPage.tsx');
    expect(page).toContain('SUPERVISORY_ROLE_LABEL[role]');
    expect(page).toContain('role={role} calendarMonth');
    expect(page).not.toMatch(/\.projectName\b/);
  });
});

describe('scope summary', () => {
  it('reads every Dealership for a Project-wide role, else how many', () => {
    expect(scopeSummary({ allDealers: true, dealerCount: 0, outletCount: 0 })).toBe('All dealerships · All outlets');
    expect(scopeSummary({ allDealers: false, dealerCount: 1, outletCount: 3 })).toBe('1 dealership · 3 outlets');
    expect(scopeSummary({ allDealers: false, dealerCount: 2, outletCount: 1 })).toBe('2 dealerships · 1 outlet');
  });
});
