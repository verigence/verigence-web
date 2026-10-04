import { useEffect, useRef } from 'react';

import { countLabel } from './messagePlan';

interface Props {
  people: number;
  groups: number;
  messageName: string;
  channelName: string;
  isWelcome: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmSendDialog({ people, groups, messageName, channelName, isWelcome, onConfirm, onCancel }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section className="uc01-admin-dialog hrm-dialog" role="dialog" aria-modal="true" aria-labelledby="hrm-confirm-title">
        <div>
          <span className="eyebrow">Confirm</span>
          <h2 id="hrm-confirm-title">Send to {countLabel(people, 'user', 'users')}?</h2>
          <p>
            <strong>{messageName}</strong> will be sent by {channelName} to <strong>{countLabel(people, 'user', 'users')}</strong>.
            {groups > 1 ? ` It goes out in ${groups} groups of up to 5, one group after another.` : ''}
          </p>
        </div>
        {isWelcome ? (
          <div className="uc01-admin-message uc01-admin-message--info">
            Each person gets a NEW temporary password by email, and the previous password stops working straight away.
            Emails cannot be taken back once sent.
          </div>
        ) : (
          <div className="uc01-admin-message uc01-admin-message--info">
            The message goes out as written in the preview. The saved template is not changed. Emails cannot be taken back once sent.
          </div>
        )}
        <div className="uc01-admin-dialog__actions">
          <button ref={cancel} type="button" className="uc01-admin-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={onConfirm}>
            Send to {countLabel(people, 'user', 'users')}
          </button>
        </div>
      </section>
    </div>
  );
}
