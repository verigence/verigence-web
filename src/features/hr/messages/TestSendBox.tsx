import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { hrErrorMessage } from '../../../services/hr/client';
import { sendMessageTest, type MessageChannel, type MessageTemplateCode } from '../../../services/hr/messages';
import Field from '../Field';
import { looksLikeEmail, reasonLabel } from './messagePlan';

interface Props {
  accessToken: string;
  template: MessageTemplateCode;
  channel: MessageChannel;
  /** GENERAL only: the wording shown in the preview, sent the same way as a real send. */
  subject?: string;
  body?: string;
  /** A real send is running, or email is not set up, or the wording has a problem. */
  disabled: boolean;
  disabledReason?: string;
}

const STORAGE_KEY = 'hr.messages.testAddress';

// Browser storage may be blocked or empty, so every use is guarded. Only an email address is kept, per tab.
function readRemembered(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
function remember(value: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* not remembered; the screen works the same */
  }
}

type Outcome = { ok: boolean; text: string };

export default function TestSendBox({ accessToken, template, channel, subject, body, disabled, disabledReason }: Props) {
  const [to, setTo] = useState(readRemembered);
  const [touched, setTouched] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const address = to.trim();
  const formatProblem = touched && address && !looksLikeEmail(address) ? 'Type a full email address, like name@example.com.' : '';

  // One attempt per click.
  const test = useMutation({
    mutationFn: (sentTo: string) =>
      sendMessageTest(accessToken, {
        channel,
        template,
        to: sentTo,
        ...(template === 'GENERAL' ? { subject, body } : {}),
      }),
    onSuccess: (result, sentTo) => {
      if (result.status === 'SENT') {
        setOutcome({ ok: true, text: `Test sent to ${sentTo}. No login was changed.` });
      } else {
        const why = reasonLabel(result.code);
        setOutcome({ ok: false, text: `${result.message ?? 'The test email did not go.'}${why ? ` ${why}` : ''}` });
      }
    },
    onError: (error) => setOutcome({ ok: false, text: hrErrorMessage(error) }),
  });

  const canTest = !disabled && !test.isPending && looksLikeEmail(address);

  return (
    <div className="hrm-test">
      <span className="hrm-label">Send me a test</span>
      <p className="hrm-test__note">
        The test goes only to the address you type. It uses a fake password, changes no login, and is not added to the history. The
        subject starts with [TEST].
      </p>
      <div className="hrm-test__row">
        <Field label="Your email address" htmlFor="hrm-test-to" error={formatProblem}>
          <input
            id="hrm-test-to"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={to}
            maxLength={320}
            placeholder="name@example.com"
            onChange={(e) => { setTo(e.target.value); setOutcome(null); remember(e.target.value.trim()); }}
            onBlur={() => setTouched(true)}
          />
        </Field>
        <button
          type="button"
          className="uc01-admin-button hrm-test__button"
          disabled={!canTest}
          onClick={() => { setOutcome(null); test.mutate(address); }}
        >
          {test.isPending ? 'Sending test…' : 'Send me a test'}
        </button>
      </div>
      {disabled && disabledReason && <span className="hr-muted">{disabledReason}</span>}
      {outcome && (
        <div className={`uc01-admin-message uc01-admin-message--${outcome.ok ? 'success' : 'error'}`} role={outcome.ok ? 'status' : 'alert'}>
          {outcome.text}
        </div>
      )}
    </div>
  );
}
