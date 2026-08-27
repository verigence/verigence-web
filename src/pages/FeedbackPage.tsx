import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { submitFeedback } from '../services/audit-core/feedback';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const MAX_SCREENSHOT_BYTES = 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type FeedbackLocationState = { from?: string } | null;

export default function FeedbackPage() {
  const location = useLocation();
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const displayName = useSessionStore((state) => state.displayName);
  const [feedbackText, setFeedbackText] = useState('');
  const [screenshot, setScreenshot] = useState<File | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const sourcePage = useMemo(() => {
    const state = location.state as FeedbackLocationState;
    return state?.from || undefined;
  }, [location.state]);

  useEffect(() => {
    if (!screenshot) {
      setPreviewUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(screenshot);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const onScreenshotChange = (file?: File) => {
    setError(undefined);
    if (!file) {
      setScreenshot(undefined);
      return;
    }
    if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
      setScreenshot(undefined);
      setError('Screenshot must be a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size >= MAX_SCREENSHOT_BYTES) {
      setScreenshot(undefined);
      setError('Screenshot must be smaller than 1 MB.');
      return;
    }
    setScreenshot(file);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setSuccess(undefined);

    const normalized = feedbackText.trim();
    if (!normalized) {
      setError('Please describe the issue or feedback.');
      return;
    }
    if (!selectedProject || !accessToken) {
      setError('Your active workspace is unavailable. Please return to the dashboard and try again.');
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({
        tenantId: selectedProject.tenantId,
        accessToken,
        feedbackText: normalized,
        submittedByDisplayName: displayName || undefined,
        pagePath: sourcePage,
        screenshot,
      });
      setFeedbackText('');
      setScreenshot(undefined);
      setSuccess('Thank you. Your feedback has been submitted to the Verigence testing team.');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="feedback-page" aria-labelledby="feedback-title">
      <div className="feedback-page__heading">
        <div>
          <span className="feedback-page__eyebrow">Testing feedback</span>
          <h1 id="feedback-title">Share feedback</h1>
          <p>Tell us what did not work as expected. You can attach one screenshot smaller than 1 MB.</p>
        </div>
      </div>

      <form className="feedback-card" onSubmit={onSubmit}>
        <label className="feedback-field">
          <span>Issue or feedback</span>
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            maxLength={4000}
            rows={8}
            placeholder="Describe what you were trying to do, what happened, and what you expected instead."
            disabled={submitting}
          />
          <small>{feedbackText.length}/4000 characters</small>
        </label>

        <label className="feedback-field feedback-field--file">
          <span>Screenshot <em>Optional</em></span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => onScreenshotChange(event.target.files?.[0])}
            disabled={submitting}
          />
          <small>PNG, JPEG or WebP. Must be smaller than 1 MB.</small>
        </label>

        {previewUrl && screenshot && (
          <div className="feedback-preview">
            <div className="feedback-preview__meta">
              <strong>{screenshot.name}</strong>
              <span>{Math.max(1, Math.round(screenshot.size / 1024))} KB</span>
              <button type="button" onClick={() => setScreenshot(undefined)} disabled={submitting}>Remove</button>
            </div>
            <img src={previewUrl} alt="Screenshot preview" />
          </div>
        )}

        {sourcePage && (
          <p className="feedback-context">Page captured automatically: <code>{sourcePage}</code></p>
        )}

        {error && <div className="feedback-message feedback-message--error" role="alert">{error}</div>}
        {success && <div className="feedback-message feedback-message--success" role="status">{success}</div>}

        <div className="feedback-actions">
          <button className="feedback-primary" type="submit" disabled={submitting || !feedbackText.trim()}>
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </form>
    </section>
  );
}
