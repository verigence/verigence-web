/**
 * Where a Project's running settings are kept (product owner, 19 Nov 2026: "all project specific
 * tasks should be under project administration ... otherwise superadmin will get lost").
 * Project Onboarding sets a Project up (the eight steps); Project Administration holds what is
 * changed while it runs.
 */
export const PROJECT_ONBOARDING_PATH = '/admin/project-onboarding';
export const PROJECT_ADMINISTRATION_PATH = '/admin/project-administration';

export const PROJECT_ADMIN_SECTIONS = [
  { key: 'duties', label: 'Daily duties' },
  { key: 'recurring', label: 'Recurring tasks' },
  { key: 'app', label: 'App version' },
  // Switch kinds of task off / on for the Project (product owner 2026-11-19).
  { key: 'tasks', label: 'Tasks raised' },
] as const;

export type ProjectAdminSection = (typeof PROJECT_ADMIN_SECTIONS)[number]['key'];

export function isProjectAdminSection(value: string | null | undefined): value is ProjectAdminSection {
  return PROJECT_ADMIN_SECTIONS.some((s) => s.key === value);
}

/** The link to a Project's settings; without a Project, to the page where one is chosen. */
export function projectAdministrationLink(tenantId?: string | null, section?: ProjectAdminSection): string {
  const query = new URLSearchParams();
  if (tenantId) query.set('project', tenantId);
  if (section) query.set('section', section);
  const text = query.toString();
  return text ? `${PROJECT_ADMINISTRATION_PATH}?${text}` : PROJECT_ADMINISTRATION_PATH;
}
