import StatusChip from '../components/StatusChip';

const workspaces = [
  {
    title: 'Process Consultant',
    description: 'Capture booking and journey evidence without re-keying customer facts.',
    status: 'Capture',
  },
  {
    title: 'TL Review Queue',
    description: 'Review evidence completeness, exceptions and extracted facts.',
    status: 'Review',
  },
  {
    title: 'PM Review',
    description: 'Validate material findings, governance decisions and escalations.',
    status: 'Govern',
  },
];

export default function DashboardPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Web foundation</span>
          <h1>Verigence workspace</h1>
          <p>
            One evidence-first application for browser, Android and iOS. The client boundary ends at
            Audit Core.
          </p>
        </div>
      </div>

      <div className="workspace-grid">
        {workspaces.map((workspace) => (
          <article className="workspace-card" key={workspace.title}>
            <div className="workspace-card__topline">
              <h2>{workspace.title}</h2>
              <StatusChip>{workspace.status}</StatusChip>
            </div>
            <p>{workspace.description}</p>
            <button className="text-action" type="button" disabled>
              Module coming next
            </button>
          </article>
        ))}
      </div>

      <article className="architecture-strip">
        <div>
          <span className="architecture-strip__label">Runtime boundary</span>
          <strong>Web / Mobile → Audit Core → Security & DI</strong>
        </div>
        <span>No direct Clerk, DI or database calls from the frontend.</span>
      </article>
    </section>
  );
}
