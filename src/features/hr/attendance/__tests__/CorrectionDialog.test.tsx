import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CorrectionDialog from '../CorrectionDialog';

vi.mock('../../../../store/sessionStore', () => {
  const state = () => ({ accessToken: 't' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

function show(props: { missesCheckOut?: boolean; isToday?: boolean } = {}): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <CorrectionDialog workDate="2026-11-10" onClose={() => {}} onDone={() => {}} {...props} />
    </QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('CorrectionDialog: a missed check-out (product owner 2026-11-10)', () => {
  it('today asks only for the check-out, with the time left', () => {
    const html = show({ missesCheckOut: true, isToday: true });
    expect(html).toContain('Ask for your check-out to be recorded');
    expect(html).toContain('Time you left (IST)');
    expect(html).not.toContain('Full day');
    expect(html).not.toContain('Half day');
  });

  it('an earlier day offers the check-out first, and a full or half day too', () => {
    const html = show({ missesCheckOut: true });
    expect(html).toMatch(/checked="" value="CHECK_OUT"/);
    expect(html).toContain('Full day');
    expect(html).toContain('Half day');
    expect(html).toContain('Time you left (IST)');
  });

  it('a day with no check-in is as before: full or half day, no time asked', () => {
    const html = show();
    expect(html).toContain('Request attendance correction');
    expect(html).toMatch(/checked="" value="FULL_DAY"/);
    expect(html).not.toContain('Record my check-out');
    expect(html).not.toContain('Time you left (IST)');
  });
});
