import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  titleId: string;
  /** While a request is in flight the dialog cannot be dismissed. */
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** The Administration dialog with Escape to close and focus moved into it. */
export default function Modal({ eyebrow, title, titleId, busy, wide, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section
        ref={ref}
        tabIndex={-1}
        className={`uc01-admin-dialog hr-pay-dialog${wide ? ' uc01-admin-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        {children}
      </section>
    </div>
  );
}
