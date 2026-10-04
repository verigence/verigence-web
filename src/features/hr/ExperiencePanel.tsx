import { useState } from 'react';

import SectionCard from '../../components/SectionCard';
import type { Experience, ExperienceInput } from '../../services/hr/employees';
import ExperienceEditor from './ExperienceEditor';
import { formatDate } from './hrLabels';

interface Props {
  experiences: Experience[];
  /** Present only when the viewer may change the list (the employee themself, or HR with manage permission). */
  editing?: {
    busy: boolean;
    error?: string;
    onAdd: (input: ExperienceInput) => Promise<unknown>;
    onReplace: (id: string, input: ExperienceInput) => Promise<unknown>;
    onRemove: (id: string) => Promise<unknown>;
  };
}

const MAX_ENTRIES = 20;

export default function ExperiencePanel({ experiences, editing }: Props) {
  const [mode, setMode] = useState<{ kind: 'add' } | { kind: 'edit'; id: string } | null>(null);

  return (
    <SectionCard title="Previous experience" description="Earlier employers, newest first.">
      {experiences.length === 0 && mode?.kind !== 'add' && <p className="hr-muted">No previous experience added.</p>}
      {experiences.length > 0 && (
        <ul className="hr-qualification-list">
          {experiences.map((x) => (
            <li key={x.experienceId}>
              {mode?.kind === 'edit' && mode.id === x.experienceId && editing ? (
                <ExperienceEditor
                  idPrefix={`hr-exp-${x.experienceId}`}
                  submitLabel="Save changes"
                  busy={editing.busy}
                  serverError={editing.error}
                  initial={{
                    company: x.company,
                    location: x.location ?? '',
                    designation: x.designation,
                    fromDate: x.fromDate,
                    toDate: x.toDate,
                    description: x.description ?? '',
                  }}
                  onSubmit={async (input) => {
                    try {
                      await editing.onReplace(x.experienceId, input);
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
                    <strong>{x.designation}</strong>
                    <small>{x.company}{x.location ? ` · ${x.location}` : ''}</small>
                    <small>{formatDate(x.fromDate)} to {formatDate(x.toDate)}</small>
                    {x.description && <small className="hr-experience-note">{x.description}</small>}
                  </span>
                  {editing && (
                    <span className="hr-row-actions">
                      <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={editing.busy} onClick={() => setMode({ kind: 'edit', id: x.experienceId })}>Edit</button>
                      <button
                        type="button"
                        className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger"
                        disabled={editing.busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${x.designation} at ${x.company}?`)) void editing.onRemove(x.experienceId).catch(() => undefined);
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
        <ExperienceEditor
          idPrefix="hr-add-exp"
          submitLabel="Add experience"
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
        <button type="button" className="uc01-admin-button" disabled={editing.busy || experiences.length >= MAX_ENTRIES} onClick={() => setMode({ kind: 'add' })}>
          Add experience
        </button>
      )}
    </SectionCard>
  );
}
