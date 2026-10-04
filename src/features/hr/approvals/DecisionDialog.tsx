import { useEffect, useRef, useState, type FormEvent } from 'react';

import { DECISION_NOTE_MAX, type DecisionKind } from '../../../services/hr/approvals';
import { decisionVerb, noteProblem, noteRequired } from './approvalFormat';

interface Props {
  decision: DecisionKind;
  /** Who and what, in one line: "Leave, 3 to 5 Oct, for Asha Rao". */
  summary: string;
  busy: boolean;
  /** An error from the server, shown above the buttons. */
  error: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

/** The note and the confirmation in one step: nothing is sent until the confirm button is pressed. */
export default function DecisionDialog({ decision, summary, busy, error, onConfirm, onCancel }: Props) {
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const verb = decisionVerb[decision];
  const required = noteRequired(decision);

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const message = noteProblem(decision, note);
    setProblem(message);
    if (!message) onConfirm(note.trim());
  };

  const confirmClass = decision === 'APPROVE' ? 'uc01-admin-button--primary' : 'uc01-admin-button--danger-primary';
  const label = decision === 'CORRECTION' ? 'What needs correcting' : decision === 'REJECT' ? 'Reason for rejecting' : 'Note to the employee';

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <form className="uc01-admin-dialog hr-appr-dialog" role="dialog" aria-modal="true" aria-labelledby="hr-appr-dialog-title" onSubmit={submit} noValidate>
        <div>
          <span className="eyebrow">Approvals</span>
          <h2 id="hr-appr-dialog-title">{verb.title}</h2>
          <p>{summary}</p>
        </div>
        <div className={`hr-field${problem ? ' hr-field--error' : ''}`}>
          <label htmlFor="hr-appr-note">
            {label}
            {required ? <span className="hr-field__required"> *</span> : <span className="hr-muted"> (optional)</span>}
          </label>
          <textarea
            id="hr-appr-note"
            ref={noteRef}
            value={note}
            maxLength={DECISION_NOTE_MAX}
            rows={4}
            disabled={busy}
            aria-invalid={Boolean(problem)}
            aria-describedby={problem ? 'hr-appr-note-error' : undefined}
            onChange={(e) => {
              setNote(e.target.value);
              if (problem) setProblem('');
            }}
          />
          {problem ? <span id="hr-appr-note-error" className="hr-field__error" role="alert">{problem}</span> : (
            <span className="hr-field__hint">{note.trim().length}/{DECISION_NOTE_MAX}. The employee can see this note.</span>
          )}
        </div>
        {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className={`uc01-admin-button ${confirmClass}`} disabled={busy}>
            {busy ? 'Saving…' : verb.button}
          </button>
        </div>
      </form>
    </div>
  );
}
