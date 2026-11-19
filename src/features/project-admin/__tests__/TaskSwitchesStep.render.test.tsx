import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import TaskSwitchesStep from '../TaskSwitchesStep';
import { projectAdminSteps, LAST_STEP } from '../ProjectAdminStepper';

describe('Project Administration → Tasks', () => {
  it('is a step before Readiness and Activate', () => {
    expect(projectAdminSteps.map((s) => s.label)).toEqual([
      'Project Details', 'Dealers', 'Dealer Outlets', 'Employees', 'Role Mapping', 'Masters & DI', 'Tasks',
      'Readiness', 'Activate Project',
    ]);
    expect(LAST_STEP).toBe(9);
  });

  it('renders its heading and the on / off filter while loading', () => {
    const html = renderToString(<TaskSwitchesStep tenantId="t1" accessToken="x" />);
    expect(html).toContain('Tasks raised on this Project');
    expect(html).toContain('Search by task, code or category');
    expect(html).toContain('Loading…');
  });
});
