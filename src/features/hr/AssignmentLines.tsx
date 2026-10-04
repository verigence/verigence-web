import type { WorkAssignment } from '../../services/hr/workAssignments';
import { assignmentWhere } from './assignmentFilters';

/** One employee's projects: name, role, dealer and outlet, with a badge when the outlet has no location. */
export default function AssignmentLines({ assignments }: { assignments: WorkAssignment[] }) {
  if (assignments.length === 0) return <span className="hr-muted">No project</span>;
  return (
    <ul className="hr-assign-lines">
      {assignments.map((a, i) => (
        <li key={`${a.projectCode}-${a.role}-${a.outletName ?? ''}-${i}`}>
          <strong>{a.projectName}</strong>
          <small>
            {[a.role, assignmentWhere(a)].filter(Boolean).join(' · ')}
            {a.outletName && !a.outletHasLocation && <span className="hr-flag hr-assign-badge">No location</span>}
          </small>
        </li>
      ))}
    </ul>
  );
}
