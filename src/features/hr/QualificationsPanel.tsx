import { useState } from 'react';

import SectionCard from '../../components/SectionCard';
import type { Degree, Qualification, QualificationInput } from '../../services/hr/employees';
import QualificationEditor from './QualificationEditor';

interface Props {
  qualifications: Qualification[];
  degrees: Degree[];
  /** Present only for HR with manage permission; the self-service page is read-only. */
  editing?: {
    busy: boolean;
    error?: string;
    onAdd: (input: QualificationInput) => Promise<unknown>;
    onReplace: (id: string, input: QualificationInput) => Promise<unknown>;
    onRemove: (id: string) => Promise<unknown>;
  };
}

export default function QualificationsPanel({ qualifications, degrees, editing }: Props) {
  const [mode, setMode] = useState<{ kind: 'add' } | { kind: 'edit'; id: string } | null>(null);

  return (
    <SectionCard title="Qualifications" description="Degree, marks and year of passing.">
      {qualifications.length === 0 && mode?.kind !== 'add' && <p className="hr-muted">No qualifications recorded.</p>}
      {qualifications.length > 0 && (
        <ul className="hr-qualification-list">
          {qualifications.map((q) => (
            <li key={q.qualificationId}>
              {mode?.kind === 'edit' && mode.id === q.qualificationId && editing ? (
                <QualificationEditor
                  degrees={degrees}
                  idPrefix={`hr-qual-${q.qualificationId}`}
                  submitLabel="Save changes"
                  busy={editing.busy}
                  serverError={editing.error}
                  initial={{
                    degreeCode: q.degreeCode,
                    degreeOther: q.degreeCode === 'OTHER' ? q.degree : '',
                    percentage: String(q.percentage),
                    yearOfPassing: String(q.yearOfPassing),
                  }}
                  onSubmit={async (input) => {
                    try {
                      await editing.onReplace(q.qualificationId, input);
                      setMode(null);
                    } catch {
                      // the error is shown by the parent; the editor stays open
                    }
                  }}
                  onCancel={() => setMode(null)}
                />
              ) : (
                <>
                  <span>
                    <strong>{q.degree}</strong>
                    <small>{q.level} · {q.percentage}% · {q.yearOfPassing}</small>
                  </span>
                  {editing && (
                    <span className="hr-row-actions">
                      <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={editing.busy} onClick={() => setMode({ kind: 'edit', id: q.qualificationId })}>Edit</button>
                      <button
                        type="button"
                        className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger"
                        disabled={editing.busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${q.degree}?`)) void editing.onRemove(q.qualificationId).catch(() => undefined);
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && mode?.kind === 'add' && (
        <QualificationEditor
          degrees={degrees}
          idPrefix="hr-add-qual"
          submitLabel="Add qualification"
          busy={editing.busy}
          serverError={editing.error}
          onSubmit={async (input) => {
            try {
              await editing.onAdd(input);
              setMode(null);
            } catch {
              // the error is shown by the parent; the editor stays open
            }
          }}
          onCancel={() => setMode(null)}
        />
      )}
      {editing && mode === null && (
        <button type="button" className="uc01-admin-button" disabled={editing.busy || qualifications.length >= 10 || degrees.length === 0} onClick={() => setMode({ kind: 'add' })}>
          Add qualification
        </button>
      )}
    </SectionCard>
  );
}
