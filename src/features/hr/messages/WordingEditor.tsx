import { useRef } from 'react';

import Field from '../Field';
import { insertAtSelection, placeholderHelp, placeholderToken } from './messagePlan';

interface Props {
  idPrefix: string;
  allowed: string[];
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  readOnly?: boolean;
  error?: string;
  subjectLabel?: string;
  bodyLabel?: string;
  bodyRows?: number;
}

/**
 * Subject and message boxes with buttons that put an allowed placeholder at the cursor.
 * The password placeholder always goes into the message, never the subject.
 */
export default function WordingEditor({
  idPrefix,
  allowed,
  subject,
  body,
  onSubject,
  onBody,
  readOnly = false,
  error,
  subjectLabel = 'Subject',
  bodyLabel = 'Message',
  bodyRows = 8,
}: Props) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'body'>('body');
  // A box nobody has clicked into has no real cursor yet: the placeholder then goes at the end.
  const touched = useRef({ subject: false, body: false });

  const insert = (key: string) => {
    const target = key === 'temp_password' ? 'body' : lastField.current;
    const element = target === 'body' ? bodyRef.current : subjectRef.current;
    const current = target === 'body' ? body : subject;
    const hasCursor = touched.current[target];
    const next = insertAtSelection(
      current,
      hasCursor ? element?.selectionStart : null,
      hasCursor ? element?.selectionEnd : null,
      placeholderToken(key),
    );
    if (target === 'body') onBody(next.value);
    else onSubject(next.value);
    window.requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="hrm-wording">
      <Field label={subjectLabel} htmlFor={`${idPrefix}-subject`} hint={readOnly ? undefined : 'The password can never go in the subject.'}>
        <input
          id={`${idPrefix}-subject`}
          ref={subjectRef}
          type="text"
          value={subject}
          maxLength={200}
          readOnly={readOnly}
          onFocus={() => { lastField.current = 'subject'; touched.current.subject = true; }}
          onChange={(e) => onSubject(e.target.value)}
        />
      </Field>
      <Field label={bodyLabel} htmlFor={`${idPrefix}-body`}>
        <textarea
          id={`${idPrefix}-body`}
          ref={bodyRef}
          rows={bodyRows}
          value={body}
          maxLength={5000}
          readOnly={readOnly}
          onFocus={() => { lastField.current = 'body'; touched.current.body = true; }}
          onChange={(e) => onBody(e.target.value)}
        />
      </Field>
      {!readOnly && (
        <div className="hrm-insert" role="group" aria-label="Insert a placeholder">
          <span className="hrm-insert__label">Insert at the cursor</span>
          <div className="hrm-insert__buttons">
            {allowed.map((key) => (
              <button
                key={key}
                type="button"
                className="uc01-admin-button hrm-chipbutton"
                title={placeholderHelp[key] ?? key}
                onClick={() => insert(key)}
              >
                {placeholderToken(key)}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
    </div>
  );
}
