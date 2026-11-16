import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CorrectionDialog from '../CorrectionDialog';
import type { CorrectionAsk } from '../calendarFormat';

vi.mock('../../../../store/sessionStore', () => {
  const state = () => ({ accessToken: 't' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

function show(props: { missesCheckOut?: boolean; isToday?: boolean; ask?: CorrectionAsk } = {}): string {
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <CorrectionDialog workDate="2026-11-10" onClose={() => {}} onDone={() => {}} {...props} />
    </QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

const recorded = (over: Partial<CorrectionAsk> = {}): CorrectionAsk => ({
  date: '2026-11-10',
  missesCheckOut: false,
  checkInAt: '2026-11-10T06:10:00Z', // 11:40 IST
  checkOutAt: '2026-11-10T13:30:00Z', // 19:00 IST
  outOfFenceIn: false,
  outOfFenceOut: false,
  canCountDay: false,
  ...over,
});

describe('CorrectionDialog: a missed check-out (product owner 2026-11-10)', () => {
  it('today asks only for the time left', () => {
    const html = show({ missesCheckOut: true, isToday: true });
    expect(html).toContain('Time you left (IST)');
    expect(html).not.toContain('full day');
    expect(html).not.toContain('half day');
  });

  it('an earlier day offers the time correction first, and a full or half day too', () => {
    const html = show({ missesCheckOut: true });
    expect(html).toMatch(/checked="" value="ADJUST"/);
    expect(html).toContain('Count the day as a full day');
    expect(html).toContain('Count the day as a half day');
    expect(html).toContain('Time you left (IST)');
  });

  it('a day with no check-in is as before: full or half day, no time asked', () => {
    const html = show();
    expect(html).toContain('Request attendance correction');
    expect(html).toMatch(/checked="" value="FULL_DAY"/);
    expect(html).not.toContain('value="ADJUST"');
    expect(html).not.toContain('Time you left (IST)');
  });
});

describe('CorrectionDialog: time and location (product owner 2026-11-16)', () => {
  it('a full day checked in late asks for the earlier check-in or later check-out only', () => {
    const html = show({ ask: recorded() });
    expect(html).toContain('Recorded: check-in 11:40 am, check-out 7:00 pm');
    expect(html).toContain('Actual check-in time (IST), earlier than 11:40');
    expect(html).toContain('max="11:40"');
    expect(html).toContain('Actual check-out time (IST), later than 19:00');
    expect(html).not.toContain('value="FULL_DAY"');
    expect(html).not.toContain('I was at my outlet');
  });

  it('offers a location correction only for the side outside the outlet', () => {
    const html = show({ ask: recorded({ outOfFenceIn: true }) });
    expect(html).toContain('Location: I was at my outlet');
    expect(html).toContain('At check-in');
    expect(html).not.toContain('At check-out');
  });

  it('a half day (rejected) can also be asked to count as a full day', () => {
    const html = show({ ask: recorded({ canCountDay: true }) });
    expect(html).toContain('value="ADJUST"');
    expect(html).toContain('value="FULL_DAY"');
  });
});
