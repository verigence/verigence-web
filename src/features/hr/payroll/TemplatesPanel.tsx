import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getTemplates, payrollKeys, type SalaryTemplate } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import { EmptyState, ErrorState, LoadingState } from './PayrollStates';
import TemplateEditorDialog from './TemplateEditorDialog';
import { describeComponent } from './templateForm';

export default function TemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [editing, setEditing] = useState<SalaryTemplate | 'new' | null>(null);
  const [notice, setNotice] = useState('');

  const list = useQuery({
    queryKey: payrollKeys.templates,
    queryFn: () => getTemplates(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = list.data?.items ?? [];

  return (
    <div className="hr-sections">
      <div className="hr-pay-intro">
        <p>
          Templates say how a monthly gross is split into components. They are generic starting points: review them before the first salary is proposed.
          Changing a template never changes a salary that was already proposed.
        </p>
        {list.data?.bandNote && <p className="hr-pay-note">{list.data.bandNote}</p>}
        {canEdit && <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" onClick={() => { setNotice(''); setEditing('new'); }}>New template</button>}
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {list.isLoading && <LoadingState>Loading templates…</LoadingState>}
      {list.isError && <ErrorState title="The templates could not be loaded." error={list.error} onRetry={() => list.refetch()} busy={list.isFetching} />}
      {list.isSuccess && items.length === 0 && <EmptyState>There are no salary templates yet.</EmptyState>}

      <div className="hr-pay-cards">
        {items.map((t) => (
          <article key={t.templateId} className="hr-pay-card">
            <header className="hr-pay-card__head">
              <div>
                <strong className="hr-pay-card__title">{t.name}</strong>
                <small>{t.code}</small>
              </div>
              <span className={`hr-pay-pill hr-pay-pill--${t.active ? 'approved' : 'draft'}`}>{t.active ? 'In use' : 'Not in use'}</span>
            </header>
            {t.description && <p className="hr-pay-sub">{t.description}</p>}
            <ul className="hr-pay-template-parts">
              {t.components.map((c) => (
                <li key={c.code}>
                  <span>{describeComponent(c)}</span>
                  <small>{[c.pf_wage ? 'PF wage' : null, c.esi_wage ? 'ESI wage' : null].filter(Boolean).join(' · ') || 'no PF or ESI'}</small>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="hr-pay-card__actions">
                <button type="button" className="uc01-admin-button hr-pay-button" onClick={() => { setNotice(''); setEditing(t); }}>Edit</button>
              </div>
            )}
          </article>
        ))}
      </div>

      {editing && (
        <TemplateEditorDialog
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); setNotice(message); }}
        />
      )}
    </div>
  );
}
