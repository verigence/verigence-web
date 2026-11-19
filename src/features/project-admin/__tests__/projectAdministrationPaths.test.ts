import { describe, expect, it } from 'vitest';

import {
  PROJECT_ADMINISTRATION_PATH, PROJECT_ONBOARDING_PATH, isProjectAdminSection, projectAdministrationLink,
} from '../projectAdministrationPaths';

describe('Project Onboarding and Project Administration', () => {
  it('are two screens with their own address', () => {
    expect(PROJECT_ONBOARDING_PATH).toBe('/admin/project-onboarding');
    expect(PROJECT_ADMINISTRATION_PATH).toBe('/admin/project-administration');
  });

  it('links to a Project and one of its settings', () => {
    expect(projectAdministrationLink()).toBe('/admin/project-administration');
    expect(projectAdministrationLink('t1')).toBe('/admin/project-administration?project=t1');
    expect(projectAdministrationLink('t1', 'duties')).toBe('/admin/project-administration?project=t1&section=duties');
    expect(projectAdministrationLink(undefined, 'app')).toBe('/admin/project-administration?section=app');
  });

  it('knows its settings', () => {
    expect(['duties', 'recurring', 'app'].every(isProjectAdminSection)).toBe(true);
    expect(isProjectAdminSection('team')).toBe(false);
    expect(isProjectAdminSection(null)).toBe(false);
  });
});
