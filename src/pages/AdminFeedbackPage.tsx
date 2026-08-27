import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  listAdminFeedback,
  loadFeedbackScreenshot,
  type AdminFeedbackItem,
} from '../services/audit-core/feedback';
import { useSessionStore } from '../store/sessionStore';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function ScreenshotViewer({ item, accessToken }: { item: AdminFeedbackItem; accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (imageUrl) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const blob = await loadFeedbackScreenshot(accessToken, item.feedbackId);
      setImageUrl(URL.createObjectURL(blob));
      setOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load screenshot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-feedback-screenshot">
      <button type="button" onClick={toggle} disabled={loading}>
        {loading ? 'Loading…' : open ? 'Hide screenshot' : 'View screenshot'}
      </button>
      {error && <span className="admin-feedback-screenshot__error">{error}</span>}
      {open && imageUrl && (
        <div className="admin-feedback-screenshot__image">
          <img src={imageUrl} alt={`Feedback screenshot from ${item.submittedByDisplayName || item.submittedByUserId}`} />
        </div>
      )}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const feedbackQuery = useQuery({
    queryKey: ['admin-feedback'],
    enabled: Boolean(accessToken),
    queryFn: () => listAdminFeedback(accessToken!, 0, 100),
  });

  return (
    <section className="admin-feedback-page" aria-labelledby="admin-feedback-title">
      <div className="admin-feedback-page__heading">
        <div>
          <span className="feedback-page__eyebrow">Application testing</span>
          <h1 id="admin-feedback-title">User Feedback</h1>
          <p>Feedback submitted by Process Coordinators, Team Leads and Project Managers.</p>
        </div>
        <button type="button" onClick={() => feedbackQuery.refetch()} disabled={feedbackQuery.isFetching}>
          {feedbackQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {feedbackQuery.isLoading && <div className="admin-feedback-state">Loading feedback…</div>}
      {feedbackQuery.isError && (
        <div className="feedback-message feedback-message--error" role="alert">
          {feedbackQuery.error instanceof Error ? feedbackQuery.error.message : 'Unable to load feedback.'}
        </div>
      )}

      {feedbackQuery.data && (
        <>
          <div className="admin-feedback-summary">
            <strong>{feedbackQuery.data.total}</strong>
            <span>Total feedback submissions</span>
          </div>

          {feedbackQuery.data.items.length === 0 ? (
            <div className="admin-feedback-state">No feedback has been submitted yet.</div>
          ) : (
            <div className="admin-feedback-list">
              {feedbackQuery.data.items.map((item) => (
                <article className="admin-feedback-card" key={item.feedbackId}>
                  <header>
                    <div>
                      <strong>{item.submittedByDisplayName || item.submittedByUserId}</strong>
                      <span>{item.submittedByRole} · {item.projectName}</span>
                    </div>
                    <time dateTime={item.createdAtUtc}>{formatDate(item.createdAtUtc)}</time>
                  </header>

                  <p className="admin-feedback-card__text">{item.feedbackText}</p>

                  <dl className="admin-feedback-card__meta">
                    <div><dt>Project / Tenant</dt><dd>{item.tenantId}</dd></div>
                    <div><dt>User ID</dt><dd>{item.submittedByUserId}</dd></div>
                    {item.pagePath && <div><dt>Reported from</dt><dd><code>{item.pagePath}</code></dd></div>}
                    {item.hasScreenshot && (
                      <div>
                        <dt>Screenshot</dt>
                        <dd>{item.screenshotFileName || 'Screenshot'}{item.screenshotSizeBytes ? ` · ${Math.max(1, Math.round(item.screenshotSizeBytes / 1024))} KB` : ''}</dd>
                      </div>
                    )}
                  </dl>

                  {item.hasScreenshot && accessToken && (
                    <ScreenshotViewer item={item} accessToken={accessToken} />
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
