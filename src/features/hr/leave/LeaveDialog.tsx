import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  titleId: string;
  eyebrow: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Shell for the leave confirmation dialogs. Escape closes it unless a request is in flight. */
export default function LeaveDialog({ title, titleId, eyebrow, busy, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button:not([disabled])');
    first?.focus();
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
    <div className="uc01-admin-dialog-backdrop hr-leave-backdrop" role="presentation">
      <section ref={ref} className="uc01-admin-dialog hr-leave-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        {children}
      </section>
    </div>
  );
}
