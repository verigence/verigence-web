import { useMemo, useState } from 'react';

import SectionCard from '../../../components/SectionCard';
import {
  MESSAGE_BATCH_LIMIT,
  type MessageChannel,
  type MessageTemplate,
  type MessageTemplateCode,
} from '../../../services/hr/messages';
import ConfirmSendDialog from './ConfirmSendDialog';
import RecipientPicker from './RecipientPicker';
import SendRunPanel from './SendRunPanel';
import TestSendBox from './TestSendBox';
import WordingEditor from './WordingEditor';
import { channelText, countLabel, renderPreview, templateText, toBatches, validateWording, type Recipient } from './messagePlan';
import { useSendRun, type StartInput } from './useSendRun';

type Pending = Omit<StartInput, 'people'> & { people: Recipient[] };

interface Props {
  accessToken: string;
  templates: MessageTemplate[];
  mailConfigured: boolean;
}

/** Only email can be sent today. The WhatsApp choice is shown, switched off, so the screen is ready for it. */
const WHATSAPP_READY = false;

const WELCOME_EXPLAINED =
  'Each person gets a NEW temporary password by email. The previous password stops working. People whose login is still waiting for SuperAdmin to allow it are skipped.';

export default function SendTab({ accessToken, templates, mailConfigured }: Props) {
  const [code, setCode] = useState<MessageTemplateCode>('GENERAL');
  const [channel, setChannel] = useState<MessageChannel>('EMAIL');
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const { run, start, stopAfterThisGroup, clear } = useSendRun(accessToken);

  const running = run?.phase === 'running';
  const general = templates.find((t) => t.code === 'GENERAL');
  const welcome = templates.find((t) => t.code === 'WELCOME');
  const saved = code === 'GENERAL' ? general : welcome;

  // General wording: the saved template until HR edits it here. The saved template is never changed from this tab.
  const subject = code === 'GENERAL' ? subjectDraft ?? general?.subject ?? '' : welcome?.subject ?? '';
  const body = code === 'GENERAL' ? bodyDraft ?? general?.body ?? '' : welcome?.body ?? '';
  const edited = code === 'GENERAL' && (subjectDraft !== null || bodyDraft !== null);

  const wordingProblem = saved ? validateWording(code, subject, body, saved.placeholders) : 'The message is not available.';
  const first = selected[0];
  const preview = useMemo(
    () => (first ? { subject: renderPreview(subject, first), body: renderPreview(body, first) } : null),
    [first, subject, body],
  );

  const blocker = !mailConfigured
    ? 'Email is not set up yet, so nothing can be sent.'
    : selected.length === 0
      ? 'Choose at least one user.'
      : wordingProblem && code === 'GENERAL'
        ? wordingProblem
        : '';
  const canSend = !running && !blocker;
  const testBlocker = running
    ? 'A send is running. Tests are off until it finishes.'
    : !mailConfigured
      ? 'Email is not set up yet.'
      : code === 'GENERAL' && wordingProblem
        ? wordingProblem
        : '';
  const askToSend = () =>
    setConfirm({
      people: selected,
      template: code,
      channel,
      ...(code === 'GENERAL' ? { subject, body } : {}),
    });

  const begin = (plan: Pending) => {
    setConfirm(null);
    void start(plan);
  };

  // Sending the rest uses the same message as the run that stopped, whatever is chosen on screen now.
  const sendRest = (ids: string[]) => {
    if (!run) return;
    setConfirm({
      people: ids.map((id) => run.people[id]).filter((p): p is Recipient => Boolean(p)),
      template: run.template,
      channel: run.channel,
      subject: run.subject,
      body: run.body,
    });
  };
  const selectNotSent = (ids: string[]) => {
    if (!run) return;
    setSelected(ids.map((id) => run.people[id]).filter((p): p is Recipient => Boolean(p)));
  };

  return (
    <div className="hrm-panel">
      {!mailConfigured && (
        <div className="uc01-admin-message uc01-admin-message--error hrm-banner" role="alert">
          <strong>Email is not set up yet.</strong> Ask your administrator to add the mail account in Railway.
        </div>
      )}

      <SectionCard title="1. Choose the message">
        <div className="hrm-choices" role="radiogroup" aria-label="Message">
          {(['GENERAL', 'WELCOME'] as MessageTemplateCode[]).map((key) => (
            <label key={key} className={`hrm-choice${code === key ? ' is-selected' : ''}`}>
              <input type="radio" name="hrm-template" checked={code === key} disabled={running} onChange={() => setCode(key)} />
              <span>
                <strong>{templateText[key]}</strong>
                <small>
                  {key === 'GENERAL'
                    ? 'You write or edit the subject and message. Your changes are used for this send only.'
                    : 'Sends the sign-in ID and a new temporary password. The wording comes from the saved template.'}
                </small>
              </span>
            </label>
          ))}
        </div>

        <div className="hrm-channel" role="radiogroup" aria-label="Channel">
          <span className="hrm-channel__label">Send by</span>
          <label className="hrm-channel__option">
            <input type="radio" name="hrm-channel" checked={channel === 'EMAIL'} disabled={running} onChange={() => setChannel('EMAIL')} />
            <span>Email</span>
          </label>
          <label className="hrm-channel__option is-disabled">
            <input type="radio" name="hrm-channel" disabled={!WHATSAPP_READY} onChange={() => setChannel('WHATSAPP')} />
            <span>WhatsApp (not set up yet)</span>
          </label>
        </div>

        {code === 'GENERAL' ? (
          <>
            <WordingEditor
              idPrefix="hrm-send"
              allowed={general?.placeholders ?? []}
              subject={subject}
              body={body}
              onSubject={(v) => setSubjectDraft(v)}
              onBody={(v) => setBodyDraft(v)}
              readOnly={running}
              error={edited && wordingProblem ? wordingProblem : undefined}
            />
            <div className="hr-actions">
              <button
                type="button"
                className="uc01-admin-button"
                disabled={running || !edited}
                onClick={() => { setSubjectDraft(null); setBodyDraft(null); }}
              >
                Use the saved text again
              </button>
              <span className="hr-muted">The saved template is the starting text. Editing here does not change it.</span>
            </div>
          </>
        ) : (
          <>
            <div className="uc01-admin-message uc01-admin-message--info">{WELCOME_EXPLAINED}</div>
            <div className="hrm-readonly">
              <span className="hrm-label">Subject</span>
              <p className="hrm-readonly__subject">{welcome?.subject}</p>
              <span className="hrm-label">Message (from the saved template)</span>
              <pre className="hrm-text">{welcome?.body}</pre>
              <span className="hr-muted">To change this wording, use the Templates tab.</span>
            </div>
          </>
        )}
      </SectionCard>

      <RecipientPicker accessToken={accessToken} selected={selected} onChange={setSelected} disabled={running} isWelcome={code === 'WELCOME'} />

      <SectionCard
        title="3. Preview and send"
        description={first ? `Preview for ${first.name}, the first user chosen.` : undefined}
      >
        {preview ? (
          <div className="hrm-preview" aria-label="Preview">
            <span className="hrm-label">Subject</span>
            <p className="hrm-preview__subject">{preview.subject}</p>
            <span className="hrm-label">Message</span>
            <pre className="hrm-text">{preview.body}</pre>
            <small className="hr-muted">
              {code === 'WELCOME'
                ? 'The password shown as •••••••• is only a mask. A real one is created when you send and is never shown here.'
                : 'Company name and links are filled in when the message is sent.'}
            </small>
          </div>
        ) : (
          <div className="uc01-admin-state">Choose at least one user to see a preview.</div>
        )}

        <div className="hrm-sendbar">
          <button
            type="button"
            className="uc01-admin-button uc01-admin-button--primary hrm-sendbutton"
            disabled={!canSend}
            onClick={askToSend}
          >
            {running ? 'Sending…' : selected.length > 0 ? `Send to ${countLabel(selected.length, 'user', 'users')}` : 'Send'}
          </button>
          {blocker && !running && <span className="hr-muted" role="status">{blocker}</span>}
        </div>

        <TestSendBox
          accessToken={accessToken}
          template={code}
          channel={channel}
          {...(code === 'GENERAL' ? { subject, body } : {})}
          disabled={Boolean(testBlocker)}
          disabledReason={testBlocker}
        />
      </SectionCard>

      {run && (
        <SendRunPanel run={run} onStop={stopAfterThisGroup} onSendRest={sendRest} onSelectNotSent={selectNotSent} onClear={clear} />
      )}

      {confirm && (
        <ConfirmSendDialog
          people={confirm.people.length}
          groups={toBatches(confirm.people.map((p) => p.userId), MESSAGE_BATCH_LIMIT).length}
          messageName={templateText[confirm.template]}
          channelName={channelText[confirm.channel]}
          isWelcome={confirm.template === 'WELCOME'}
          onConfirm={() => begin(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
