import { useEffect, useState } from 'react';

import {
  clearRememberLog,
  getRememberLogSnapshot,
  subscribeRememberLog,
  type RememberLogEntry,
} from '../services/security/rememberDebugLog';

// TEMPORARY DIAGNOSTIC (remember-me investigation, 2026-09-18): renders the on-device
// remember-me log so it can be read (and copied) straight off the phone screen, with no adb /
// logcat / remote-debugging setup needed. Remove this component and its mount point in
// main.tsx once the root cause is confirmed and fixed.
export default function RememberMeDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RememberLogEntry[]>(() => getRememberLogSnapshot());
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeRememberLog(setEntries), []);

  const asText = entries
    .map((entry) => `${entry.time} ${entry.step} ${JSON.stringify(entry.detail)}`)
    .join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText || '(no entries yet)');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the text is still visible to select manually.
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 99999,
          background: '#0f172a',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 700,
          opacity: 0.85,
        }}
      >
        remember-log ({entries.length})
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.96)',
        color: '#e6f6ec',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: 10, borderBottom: '1px solid #334155' }}>
        <strong style={{ flex: 1, fontFamily: 'inherit' }}>remember-me log ({entries.length})</strong>
        <button type="button" onClick={copy}>{copied ? 'copied!' : 'copy'}</button>
        <button type="button" onClick={clearRememberLog}>clear</button>
        <button type="button" onClick={() => setOpen(false)}>close</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {entries.length === 0
          ? 'No entries yet. Log in with "Keep me signed in" checked, then fully close and reopen the app.'
          : entries.map((entry, index) => (
            <div key={index} style={{ marginBottom: 8 }}>
              <div style={{ color: '#7fd8c9' }}>{entry.time.slice(11, 19)} — {entry.step}</div>
              <div>{JSON.stringify(entry.detail)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
