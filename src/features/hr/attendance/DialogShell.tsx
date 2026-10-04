import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  /** True while a request is in flight: the window cannot be dismissed. */
  locked?: boolean;
  wide?: boolean;
  children: ReactNode;
}

/** The uc01-admin dialog with Escape-to-close, initial focus and focus given back on close. */
export default function DialogShell({ title, eyebrow, onClose, locked = false, wide = false, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useRef(`hr-att-dialog-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  return (
    <div
      className="uc01-admin-dialog-backdrop hr-att-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={`uc01-admin-dialog hr-att-dialog${wide ? ' hr-att-dialog--wide' : ''}`}
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
