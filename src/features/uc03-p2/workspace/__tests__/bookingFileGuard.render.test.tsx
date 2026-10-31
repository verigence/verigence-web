import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2JourneyWorkspacePage from '../../../../pages/P2JourneyWorkspacePage';
import type { P2DocumentsResponse, P2JourneyFile } from '../../../../services/audit-core/uc03P2';
import { answerDifferentCustomer, splitDroppedFiles } from '../customerNameGuard';
import { P2BookingBanner, P2BookingCreatedNotice, P2ForeignFileNotices, foreignFiles } from '../P2BookingContext';
import P2DifferentCustomerPrompt from '../P2DifferentCustomerPrompt';
import { uploadActivity } from '../P2UploadPanel';
import {
  carryTaken, followRoute, journeyCreated, newBookingIdempotencyKey, openSession, startNextBooking,
} from '../workspaceSession';

// Server rendering reads a zustand store's initial state, so the page's two
// stores are stood in for by plain values the tests set.
const stores = vi.hoisted(() => ({
  project: undefined as unknown,
  session: { accessToken: undefined as string | undefined, outletId: '' },
}));
vi.mock('../../../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: stores.project, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../../../store/sessionStore', () => {
  const state = () => stores.session;
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

type Button = { text: string; onClick?: () => void; disabled?: boolean };

/** Server rendering marks where text pieces join; the reader sees one text. */
const html = (node: ReactNode) => renderToString(node).replaceAll('<!-- -->', '');

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** The buttons of a props-only component's output, to press them without a DOM. */
function buttons(node: ReactNode): Button[] {
  const found: Button[] = [];
  const walk = (current: ReactNode) => {
    if (Array.isArray(current)) { current.forEach(walk); return; }
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>(current)) return;
    if (current.type === 'button') {
      found.push({ text: textOf(current.props.children), onClick: current.props.onClick, disabled: current.props.disabled });
    }
    walk(current.props.children);
  };
  walk(node);
  return found;
}

const press = (node: ReactNode, text: string) => {
  const button = buttons(node).find((candidate) => candidate.text === text);
  if (!button?.onClick) throw new Error(`No button "${text}" in ${buttons(node).map((b) => b.text).join(', ')}`);
  button.onClick();
};

const inRouter = (node: ReactNode) => html(<MemoryRouter>{node}</MemoryRouter>);

const foreign = (overrides: Partial<P2JourneyFile> = {}): P2JourneyFile => ({
  batchId: 'b2',
  fileName: 'Tapan kumar patra.pdf',
  uploadedAtUtc: '2026-10-31T10:05:00Z',
  identity: { status: 'FOREIGN', personName: 'TAPAN KUMAR PATRA', maskedPan: 'XXXXX1234X', reason: 'The PAN card names another person.' },
  ...overrides,
});

describe('the different-customer question', () => {
  const file = new File([new Uint8Array(4)], 'Tapan kumar patra.pdf', { type: 'application/pdf' });
  const known = { customerName: 'AZIZUR REHAMAN', fileNames: ['Azizur Reheman.pdf'] };

  it('asks before the file goes in, and "Start new booking with this file" sends it to a new booking', () => {
    const { pass, held } = splitDroppedFiles([file], known);
    expect(pass).toEqual([]);
    expect(held).toEqual([file]);
    const startedWith: File[][] = [];
    const uploadedHere: File[][] = [];
    const answer = (choice: 'start-new' | 'add-here' | 'cancel') => {
      const { startNewWith, upload } = answerDifferentCustomer(choice, held, true);
      if (startNewWith.length) startedWith.push(startNewWith);
      if (upload.length) uploadedHere.push(upload);
    };
    const prompt = P2DifferentCustomerPrompt({
      fileNames: held.map((f) => f.name), bookingName: 'Azizur Rehaman',
      onStartNew: () => answer('start-new'), onAddHere: () => answer('add-here'), onCancel: () => answer('cancel'),
    });
    expect(buttons(prompt).map((b) => b.text)).toEqual(['Start new booking with this file', 'Add to this booking']);
    expect(html(prompt)).toContain('“Tapan kumar patra.pdf” looks like a different customer from this booking (Azizur Rehaman). Start a new booking with it, or add it here?');

    press(prompt, 'Start new booking with this file');
    expect(startedWith).toEqual([[file]]);
    expect(uploadedHere).toEqual([]);
  });

  it('"Add to this booking" uploads it here', () => {
    const onStartNew = vi.fn();
    const onAddHere = vi.fn();
    const prompt = P2DifferentCustomerPrompt({ fileNames: ['Tapan kumar patra.pdf'], bookingName: 'Azizur Rehaman', onStartNew, onAddHere, onCancel: vi.fn() });
    press(prompt, 'Add to this booking');
    expect(onAddHere).toHaveBeenCalledTimes(1);
    expect(onStartNew).not.toHaveBeenCalled();
    expect(answerDifferentCustomer('add-here', [file], true)).toEqual({ startNewWith: [], upload: [file] });
  });

  it('offers no new booking to someone who does not start bookings', () => {
    const onCancel = vi.fn();
    const prompt = P2DifferentCustomerPrompt({ fileNames: ['a.pdf', 'b.pdf'], bookingName: null, onAddHere: vi.fn(), onCancel });
    expect(buttons(prompt).map((b) => b.text)).toEqual(['Add to this booking', 'Do not upload']);
    expect(html(prompt)).toContain('look like a different customer from this booking. Add them here anyway?');
    press(prompt, 'Do not upload');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lets a file that names no one straight through', () => {
    const photo = new File([new Uint8Array(4)], 'IMG_20261019_120541.jpg', { type: 'image/jpeg' });
    expect(splitDroppedFiles([photo], known)).toEqual({ pass: [photo], held: [] });
  });
});

describe('the booking banner and "Start next booking"', () => {
  it('says which booking the documents go to, and who once identified', () => {
    let page = html(<P2BookingBanner reference="ADI-RD-261031-004" customerName="0b7a94e8-6c1d-4f2a-9b3e-5d6f7a8b9c0d" onStartNext={() => undefined} />);
    expect(page).toContain('Adding documents to booking <strong>ADI-RD-261031-004</strong> — <span class="p2w-booking-banner__pending">customer being identified</span>');
    expect(page).toContain('Start next booking');
    page = html(<P2BookingBanner reference="ADI-RD-261031-004" customerName="AZIZUR REHAMAN" />);
    expect(page).toContain('Adding documents to booking <strong>ADI-RD-261031-004</strong> — <strong>AZIZUR REHAMAN</strong>');
    expect(page).not.toContain('Start next booking');
    expect(html(<P2BookingBanner customerName={null} onStartNext={() => undefined} />)).toContain('Adding documents to this booking — ');
  });

  it('starts the next booking from the banner and from the notice after the first upload', () => {
    const onStartNext = vi.fn();
    press(P2BookingBanner({ reference: 'ADI-RD-261031-004', onStartNext }), 'Start next booking');
    const notice = P2BookingCreatedNotice({ reference: 'ADI-RD-261031-004', onStartNext, onDismiss: vi.fn() });
    expect(html(notice)).toContain('Booking <strong>ADI-RD-261031-004</strong> created. Next customer?');
    press(notice, 'Start next booking');
    expect(onStartNext).toHaveBeenCalledTimes(2);
    expect(html(P2BookingCreatedNotice({ onStartNext, onDismiss: vi.fn() }))).toContain('Booking created. Next customer?');
  });

  it('waits on files still being sent (the button says so)', () => {
    const banner = P2BookingBanner({ reference: 'R', onStartNext: vi.fn(), starting: true });
    expect(buttons(banner)).toEqual([expect.objectContaining({ text: 'Opening next booking…', disabled: true })]);
    expect(uploadActivity([{ phase: 'ACCEPTED' }, { phase: 'UPLOADING' }])).toEqual({ sending: true, failed: 0 });
    expect(uploadActivity([{ phase: 'ACCEPTED' }, { phase: 'FAILED' }])).toEqual({ sending: false, failed: 1 });
    expect(uploadActivity([], true).sending).toBe(true);
  });

  it('opens a fresh new-booking screen, with a new creation key, and keeps it across the step to the booking it creates', () => {
    // On booking j1 (opened, or created on this screen earlier).
    let session = followRoute(journeyCreated(openSession('new'), 'j1'), 'j1');
    expect(session.key).toBe(0);
    // "Start new booking with this file": the file and outlet go with it ...
    const file = new File([new Uint8Array(4)], 'Tapan kumar patra.pdf');
    session = startNextBooking(session, { files: [file], outletId: 'o1' }, 'j1');
    expect(session.key).toBe(0);
    // ... and the address turning to "new" starts a fresh screen with them.
    session = followRoute(session, 'new');
    expect(session).toEqual({ key: 1, route: 'new', carry: { files: [file], outletId: 'o1' } });
    session = carryTaken(session);
    expect(session.carry).toBeUndefined();
    // The fresh screen creates j2 and its address follows: the same screen.
    session = followRoute(journeyCreated(session, 'j2'), 'j2');
    expect(session.key).toBe(1);
    expect(session.route).toBe('j2');
    // "Capture New Booking" (or a link to another booking) is a fresh screen too.
    expect(followRoute(session, 'new').key).toBe(2);
    expect(followRoute(session, 'j3')).toEqual({ key: 2, route: 'j3', carry: undefined });
    // Already on the new-booking address: fresh at once.
    expect(startNextBooking(openSession('new'), {}, 'new')).toEqual({ key: 1, route: 'new', carry: {} });
    expect(newBookingIdempotencyKey()).not.toBe(newBookingIdempotencyKey());
  });
});

describe('a file Audit Core found to be another person\'s', () => {
  it('says so, and where it went', () => {
    const notice = inRouter(<P2ForeignFileNotices files={[foreign({ movedTo: { journeyId: 'j-tapan', reference: 'ADI-RD-261031-005' } })]} />);
    expect(notice).toContain('<strong>Tapan kumar patra.pdf</strong> is TAPAN KUMAR PATRA&#x27;s file, not this customer&#x27;s — it has been taken out of this booking and moved to booking <a');
    expect(notice).toContain('href="/p2/journeys/j-tapan/documents"');
    expect(notice).toContain('>ADI-RD-261031-005</a>.');
    expect(notice).toContain('PAN XXXXX1234X · The PAN card names another person.');
  });

  it('without a booking to move it to, only that it was taken out', () => {
    const notice = inRouter(<P2ForeignFileNotices files={[foreign({ movedTo: null, identity: { status: 'FOREIGN' } })]} />);
    expect(notice).toContain('<strong>Tapan kumar patra.pdf</strong> is another customer&#x27;s file, not this customer&#x27;s — it has been taken out of this booking.');
    expect(notice).not.toContain('moved to booking');
    expect(notice).not.toContain('<a');
  });

  it('shows nothing for files that are this customer\'s, unknown, or an Audit Core without the files list', () => {
    expect(foreignFiles([foreign({ identity: { status: 'BELONGS' } }), foreign({ identity: { status: 'UNKNOWN' } })])).toEqual([]);
    expect(inRouter(<P2ForeignFileNotices files={undefined} />)).toBe('');
  });
});

describe('the documents screen', () => {
  afterEach(() => {
    stores.project = undefined;
    stores.session = { accessToken: undefined, outletId: '' };
  });

  function render(path: string, documents?: Partial<P2DocumentsResponse>, role = 'PC') {
    stores.session = { accessToken: 'token', outletId: 'o1' };
    stores.project = { tenantId: 't1', operatingRole: role, scope: { outlets: [{ outletId: 'o1', outletName: 'Cuttack' }] } };
    const client = new QueryClient();
    if (documents) client.setQueryData(['p2-documents', 't1', 'j1'], { journeyId: 'j1', batches: [], ...documents });
    client.setQueryData(['p2-360', 't1', 'j1', 'summary'], { journey: { journeyId: 'j1', reference: 'ADI-RD-261031-004', customerName: '0b7a94e8-6c1d-4f2a-9b3e-5d6f7a8b9c0d', outletName: 'Cuttack' } });
    return html(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/p2/journeys/:journeyId/documents" element={<P2JourneyWorkspacePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('a new booking has no banner yet', () => {
    const page = render('/p2/journeys/new/documents');
    expect(page).toContain('New booking');
    expect(page).toContain('p2w-upload__drop');
    expect(page).not.toContain('Adding documents to');
  });

  it('a booking shows its banner with "Start next booking", and the files taken out of it', () => {
    let page = render('/p2/journeys/j1/documents', { customerName: 'AZIZUR REHAMAN', files: [foreign({ movedTo: { journeyId: 'j9', reference: 'ADI-RD-261031-005' } })] });
    expect(page).toContain('Adding documents to booking <strong>ADI-RD-261031-004</strong> — <strong>AZIZUR REHAMAN</strong>');
    expect(page).toContain('>Start next booking</button>');
    expect(page).toContain('href="/p2/journeys/j9/documents"');
    // the banner sits above the drop area
    expect(page.indexOf('p2w-booking-banner')).toBeLessThan(page.indexOf('p2w-upload__drop'));
    // an Audit Core without the new fields: the summary's placeholder name means not identified yet
    page = render('/p2/journeys/j1/documents', {});
    expect(page).toContain('customer being identified');
    expect(page).not.toContain('taken out of this booking');
    // a Reviewer sees the banner, not the button
    page = render('/p2/journeys/j1/documents', {}, 'REVIEWER');
    expect(page).toContain('Adding documents to booking');
    expect(page).not.toContain('Start next booking');
  });
});
