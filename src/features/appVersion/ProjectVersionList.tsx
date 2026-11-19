import { Link } from 'react-router-dom';

import type { ProjectVersionPolicy } from '../../services/security/appVersion';
import { projectAdministrationLink } from '../project-admin/projectAdministrationPaths';
import { peopleBelow, projectFromLabel } from './appVersionPolicyFormat';

/**
 * Reports > App: the Projects that have a minimum app version of their own, to read. Each is set
 * where the Project's other settings are, in Project Administration.
 */
export default function ProjectVersionList({ projects }: { projects: ProjectVersionPolicy[] }) {
  return (
    <div className="ar-version-projects" aria-labelledby="app-version-projects-title">
      <h3 id="app-version-projects-title">Projects with a minimum of their own</h3>
      <p className="hr-field__hint">
        A Project's own minimum holds for the people who work in it, and is set under{' '}
        <Link to={projectAdministrationLink(undefined, 'app')}>Project Administration</Link>, App version.
      </p>
      {projects.length === 0 ? <p className="hr-field__hint">No Project has a minimum of its own.</p> : (
        <div className="ar-table-wrap">
          <table className="ar-table">
            <thead>
              <tr><th scope="col">Project</th><th scope="col">Minimum version</th><th scope="col">Status</th><th scope="col">Still below it</th><th scope="col"><span className="visually-hidden">Open</span></th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const below = peopleBelow(p.devicesBelow);
                return (
                  <tr key={p.tenantId}>
                    <th scope="row" data-label="Project">{p.tenantName}</th>
                    <td data-label="Minimum version">{p.minimumVersion}</td>
                    <td data-label="Status">{projectFromLabel(p)}</td>
                    <td data-label="Still below it">{below === 0 ? 'Nobody' : `${below} ${below === 1 ? 'person' : 'people'}`}</td>
                    <td className="ar-version-projects__actions">
                      <Link className="uc01-admin-button" to={projectAdministrationLink(p.tenantId, 'app')}>Change</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
