import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import TaskSwitchesPanel from '../TaskSwitchesPanel';
import { PROJECT_ADMIN_SECTIONS, projectAdministrationLink } from '../projectAdministrationPaths';

describe('Project Administration → Tasks raised', () => {
  it('is a section of Project Administration, not a setup step', () => {
    expect(PROJECT_ADMIN_SECTIONS.map((s) => s.key)).toContain('tasks');
    expect(projectAdministrationLink('t1', 'tasks')).toBe('/admin/project-administration?project=t1&section=tasks');
  });

  it('renders its heading and the on / off filter while loading', () => {
    const html = renderToString(<TaskSwitchesPanel tenantId="t1" accessToken="x" />);
    expect(html).toContain('Tasks raised on this Project');
    expect(html).toContain('Search by task, code or category');
    expect(html).toContain('Loading…');
  });
});
