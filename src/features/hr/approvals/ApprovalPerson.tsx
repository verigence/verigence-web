import { initialsOf } from '../EmployeeAvatar';

interface Props {
  name: string;
  code: string;
  /** How long the request has been waiting, shown under the person. */
  waiting?: { text: string; old: boolean; sent?: string };
}

/** Name, code and an initials avatar. Approvers cannot read profile photos, so none is fetched. */
export default function ApprovalPerson({ name, code, waiting }: Props) {
  return (
    <>
      <span className="hr-appr-person">
        <span className="hr-avatar hr-avatar--sm" aria-hidden="true"><span>{initialsOf(name)}</span></span>
        <span className="hr-appr-person__text">
          <strong>{name}</strong>
          <small>{code}</small>
        </span>
      </span>
      {waiting && (
        <span className="hr-appr-waiting">
          Waiting <span className={`hr-appr-age${waiting.old ? ' is-old' : ''}`}>{waiting.text}</span>
          {waiting.sent && <small>Sent {waiting.sent}</small>}
        </span>
      )}
    </>
  );
}
