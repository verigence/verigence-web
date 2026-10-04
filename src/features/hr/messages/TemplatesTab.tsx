import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import {
  updateMessageTemplate,
  type MessageTemplate,
  type MessageTemplateList,
} from '../../../services/hr/messages';
import { formatDateTime } from '../hrLabels';
import WordingEditor from './WordingEditor';
import { messageKeys } from './messageKeys';
import { placeholderHelp, placeholderToken, templateText, validateWording } from './messagePlan';

interface Props {
  accessToken: string;
  templates: MessageTemplate[];
  canEdit: boolean;
}

function TemplateEditor({ accessToken, template, canEdit }: { accessToken: string; template: MessageTemplate; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [serverProblem, setServerProblem] = useState('');
  const [notice, setNotice] = useState('');

  const subject = subjectDraft ?? template.subject;
  const body = bodyDraft ?? template.body;
  const changed = subject !== template.subject || body !== template.body;
  const localProblem = validateWording(template.code, subject, body, template.placeholders);

  // One attempt per click. The service's own wording for a rejected template is shown as it is.
  const save = useMutation({
    mutationFn: () => updateMessageTemplate(accessToken, template.code, { subject: subject.trim(), body: body.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData<MessageTemplateList>(messageKeys.templates, (current) =>
        current ? { ...current, items: current.items.map((t) => (t.code === updated.code ? updated : t)) } : current,
      );
      setSubjectDraft(null);
      setBodyDraft(null);
      setServerProblem('');
      setNotice('Saved. New sends use this wording.');
    },
    onError: (error) => {
      setNotice('');
      if (error instanceof HrHttpError && error.code === 'MESSAGE_TEMPLATE_INVALID') {
        setServerProblem(`This wording cannot be saved. ${error.message}`);
      } else if (error instanceof HrHttpError && error.status === 403) {
        setServerProblem('You do not have permission to change templates. Ask for the HR settings permission.');
      } else {
        setServerProblem(hrErrorMessage(error));
      }
    },
  });

  const isWelcome = template.code === 'WELCOME';

  return (
    <SectionCard
      title={templateText[template.code]}
      description={template.name}
      action={
        <span className={`uc01-admin-status uc01-admin-status--${template.customised ? 'active' : 'rejected'}`}>
          {template.customised ? 'Customised' : 'Standard wording'}
        </span>
      }
      className="hrm-template"
    >
      <div className="hrm-placeholders" aria-label="Allowed placeholders">
        <span className="hrm-label">Placeholders you can use</span>
        <ul>
          {template.placeholders.map((key) => (
            <li key={key}>
              <code>{placeholderToken(key)}</code>
              <span>{placeholderHelp[key] ?? key}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="hrm-rules">
        <li>The temporary password can only be in the message body, never the subject.</li>
        {isWelcome && <li>The message must keep {'{{login_id}}'} and {'{{temp_password}}'}, or it would not carry the login.</li>}
        <li>Any other {'{{placeholder}}'} is refused, so a typing mistake cannot reach users.</li>
      </ul>

      <WordingEditor
        idPrefix={`hrm-tpl-${template.code}`}
        allowed={template.placeholders}
        subject={subject}
        body={body}
        onSubject={(v) => { setSubjectDraft(v); setNotice(''); }}
        onBody={(v) => { setBodyDraft(v); setNotice(''); }}
        readOnly={!canEdit}
        bodyRows={isWelcome ? 14 : 8}
        error={canEdit && changed && localProblem ? localProblem : undefined}
      />

      {serverProblem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{serverProblem}</div>}
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {canEdit ? (
        <div className="hr-actions">
          <button
            type="button"
            className="uc01-admin-button uc01-admin-button--primary"
            disabled={!changed || Boolean(localProblem) || save.isPending}
            onClick={() => { setServerProblem(''); setNotice(''); save.mutate(); }}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="uc01-admin-button"
            disabled={!changed || save.isPending}
            onClick={() => { setSubjectDraft(null); setBodyDraft(null); setServerProblem(''); setNotice(''); }}
          >
            Discard changes
          </button>
          <span className="hr-muted">
            {template.updatedAt ? `Last saved ${formatDateTime(template.updatedAt)} (IST).` : 'Never saved: the standard wording is in use.'}
          </span>
        </div>
      ) : (
        <p className="hr-muted">
          You can read this wording but not change it. Changing templates needs the HR settings permission.
          {template.updatedAt ? ` Last saved ${formatDateTime(template.updatedAt)} (IST).` : ''}
        </p>
      )}
    </SectionCard>
  );
}

export default function TemplatesTab({ accessToken, templates, canEdit }: Props) {
  return (
    <div className="hrm-panel">
      <p className="hrm-intro">
        These are the saved wordings. The General message is only the starting text: HR can reword it for each send. The Welcome
        message is always sent exactly as saved here.
      </p>
      {templates.map((t) => (
        <TemplateEditor key={t.code} accessToken={accessToken} template={t} canEdit={canEdit} />
      ))}
    </div>
  );
}
