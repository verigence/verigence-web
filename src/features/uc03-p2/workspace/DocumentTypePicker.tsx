import { useState } from 'react';

import type { P2Template } from '../../../services/audit-core/uc03P2';

/** The "Others" choice: not a checklist document, kept on file, never read. */
export const OTHER_DOCUMENT_TEMPLATE = 'supporting_document';

/** The types a page can be given: every checklist document DI can read (and
 * the UPI screenshot), by name. */
export function documentTypeOptions(templates: P2Template[]): P2Template[] {
  return templates.filter((t) => t.requirement !== 'SUPPORTING' || t.key === 'upi_screenshot')
    .filter((t) => t.diTypes.length)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Whether "Keep as Others" can be pressed: the page needs a name (decision 2026-09-30). */
export function othersNameProblem(name: string): string | undefined {
  return name.trim().length < 2 ? 'Give the document a name, so it can be told apart on file.' : undefined;
}

/**
 * "What is this document?" -- one control, used on the Upload / Edit Documents
 * card and on the task card (2026-10-27). A checklist type is chosen at once
 * (the page is then read as that document); Others, when offered, asks for the
 * name the page is kept under and is never read.
 */
export default function DocumentTypePicker({ options, onChoose, onCancel, allowOthers = true, busy = false, label }: {
  options: P2Template[];
  onChoose: (templateKey: string, name?: string) => void;
  onCancel?: () => void;
  /** Others only fits a page DI could not classify; a failed page is sent again as a type. */
  allowOthers?: boolean;
  busy?: boolean;
  label?: string;
}) {
  const [choice, setChoice] = useState('');
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <div className="p2w-doc__type">
      <label>
        <span>{label ?? 'What is this document?'}</span>
        <select value={choice} disabled={busy} onChange={(event) => {
          const value = event.target.value;
          setChoice(value);
          if (value && value !== OTHER_DOCUMENT_TEMPLATE) onChoose(value);
        }}>
          <option value="" disabled>Choose a type…</option>
          {options.map((option) => <option key={option.key} value={option.key}>{option.displayName}</option>)}
          {allowOthers ? <option value={OTHER_DOCUMENT_TEMPLATE}>Others (not a checklist document: kept, not read)</option> : null}
        </select>
      </label>
      {allowOthers && choice === OTHER_DOCUMENT_TEMPLATE ? (
        <>
          <label>
            <span>Name it (shown on the card and in Journey 360)</span>
            <input type="text" value={name} maxLength={120} placeholder="e.g. Employer letter" autoFocus
              onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="button" className="p2w-button p2w-button--secondary" disabled={busy || Boolean(othersNameProblem(name))}
            onClick={() => onChoose(OTHER_DOCUMENT_TEMPLATE, trimmed)}>
            Keep as Others
          </button>
        </>
      ) : null}
      {onCancel ? <button type="button" className="p2w-link" onClick={onCancel}>Cancel</button> : null}
    </div>
  );
}
