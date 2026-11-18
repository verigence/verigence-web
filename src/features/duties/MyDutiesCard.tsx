import SectionCard from '../../components/SectionCard';
import { useProjectContextStore } from '../../store/projectContextStore';
import DutyRow from './DutyRow';
import { activeDays, type DutyProjectDay } from './dutiesFormat';
import '../../styles/duties.css';

type Props = {
  days: DutyProjectDay[]; accessToken?: string;
  /** The list opens after check-in (product owner 2026-11-18: "post check in"). */
  checkedIn: boolean; checkedOut: boolean;
};

/**
 * Today's duties on the Attendance screen, Project by Project and outlet by outlet (product owner
 * 2026-11-18: "club this with the check in and check out", "they should be able to see the list
 * project wise"). Nothing is shown to a person with no duties today.
 */
export default function MyDutiesCard({ days, accessToken, checkedIn, checkedOut }: Props) {
  const selectedTenantId = useProjectContextStore((state) => state.selectedProject?.tenantId);
  const active = activeDays(days);
  if (active.length === 0) return null;
  const total = active.reduce((n, d) => n + (d.day.counts?.total ?? 0), 0);
  const done = active.reduce((n, d) => n + (d.day.counts?.done ?? 0) + (d.day.counts?.onTrack ?? 0), 0);
  const several = active.length > 1;

  return (
    <SectionCard
      title="My duties today"
      description={checkedIn
        ? 'Tick each duty as you finish it. At check-out you are asked for a reason for every mandatory duty not done; what is not done comes back tomorrow.'
        : undefined}
      action={<span className="dty-count" aria-label={`${done} of ${total} duties done`}>{done} of {total} done</span>}
    >
      {!checkedIn ? (
        <div className="uc01-admin-message uc01-admin-message--info" role="status">
          You have {total} {total === 1 ? 'duty' : 'duties'} today. Check in to open the list.
        </div>
      ) : (
        <div className="dty-projects">
          {checkedOut ? (
            <div className="uc01-admin-message uc01-admin-message--info" role="status">
              You have checked out. Anything you finish later today can still be ticked here.
            </div>
          ) : null}
          {active.map((entry) => (
            <section key={entry.tenantId} className="dty-project" aria-label={entry.projectName}>
              {several ? <h3 className="dty-project__name">{entry.projectName}</h3> : null}
              {(entry.day.outlets ?? []).map((outlet) => (
                <div key={outlet.outletId} className="dty-outlet">
                  <h4 className="dty-outlet__name">
                    {outlet.outletName}<span>{outlet.dealerName}</span>
                  </h4>
                  <ul className="dty-list">
                    {outlet.items.map((item) => (
                      <DutyRow key={item.itemId} item={item} tenantId={entry.tenantId} today={entry.day.date}
                        accessToken={accessToken} linkable={entry.tenantId === selectedTenantId} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
