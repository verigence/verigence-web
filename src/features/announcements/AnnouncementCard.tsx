import { useEffect, useRef } from 'react';

import { assetUrl } from '../../services/assets';

export interface AnnouncementView {
  kind: 'NOTICE' | 'WELCOME';
  title: string;
  /** Plain text: line breaks are kept, nothing is ever read as HTML. */
  body: string;
}

interface CardProps extends AnnouncementView {
  titleId: string;
  onDismiss?: () => void;
}

/** The message itself. The admin preview renders this same card. */
export function AnnouncementCard({ kind, title, body, titleId, onDismiss }: CardProps) {
  const welcome = kind === 'WELCOME';
  return (
    <div className={`announce-card announce-card--${welcome ? 'welcome' : 'notice'}`}>
      {onDismiss && <button type="button" className="announce-card__close" aria-label="Close" onClick={onDismiss}>×</button>}
      {welcome ? (
        <img className="announce-card__mark" src={assetUrl('brand/svg/verigence-mark.svg')} alt="" />
      ) : (
        <span className="announce-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        </span>
      )}
      <h2 id={titleId} className="announce-card__title">{title || (welcome ? 'Welcome' : 'Notice')}</h2>
      <p className="announce-card__body">{body}</p>
      <button type="button" className="announce-card__button" onClick={onDismiss} disabled={!onDismiss}>{welcome ? "Let's go" : 'Got it'}</button>
    </div>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The popup: a centred card (a bottom sheet on phones) above the app. Escape, the X, the button and the backdrop all dismiss it. */
export default function AnnouncementDialog({ kind, title, body, onDismiss }: AnnouncementView & { onDismiss: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = 'announcement-title';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('.announce-card__button')?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="announce-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onDismiss(); }} onKeyDown={onKeyDown}>
      <div ref={panel} className="announce-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <AnnouncementCard kind={kind} title={title} body={body} titleId={titleId} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
