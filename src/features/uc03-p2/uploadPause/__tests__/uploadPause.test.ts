import { describe, expect, it } from 'vitest';

import { AuditCoreHttpError } from '../../../../services/audit-core/client';
import { allProjectsRow, pauseAllCommand, projectPauses, RESUME_ALL_COMMAND } from '../../../admin/systemHealth/uploadPauseAdmin';
import { runUploads, stableClientUploadId, type UploadItem, type UploadTransport } from '../../workspace/p2Uploader';
import {
  isUploadPausedError, istTime, pauseNotice, uploadErrorText, uploadPauseState, UPLOAD_PAUSED_ERROR_CODE,
} from '../uploadPause';

const NOW = new Date('2026-10-31T15:00:00Z');
const LATER = '2026-10-31T18:00:00Z'; // 11:30 pm IST
const EARLIER = '2026-10-31T14:59:00Z';

const pausedRefusal = () => new AuditCoreHttpError(503, {
  errorCode: UPLOAD_PAUSED_ERROR_CODE,
  title: 'Uploads are paused for maintenance',
  detail: 'We are correcting bookings. Uploads are back at 31 Oct 2026, 11:30 PM IST.',
  status: 503,
  correlationId: 'c-1',
});

describe('upload pause decision', () => {
  it('is not paused until the status says so, and a failed read is not paused', () => {
    expect(uploadPauseState(undefined, false, NOW)).toEqual({ paused: false });
    expect(uploadPauseState({ paused: false, message: null, untilUtc: null }, false, NOW)).toEqual({ paused: false });
    // A read that failed after an earlier "paused" still counts as not paused.
    expect(uploadPauseState({ paused: true, message: 'x', untilUtc: null }, true, NOW)).toEqual({ paused: false });
  });

  it('is paused with the notice, naming the IST time when one is set', () => {
    expect(uploadPauseState({ paused: true, message: 'Correcting', untilUtc: null }, false, NOW)).toEqual({
      paused: true, message: 'Correcting', untilUtc: null,
      notice: 'Uploads are paused for maintenance. You can still open bookings and work your tasks.',
    });
    const state = uploadPauseState({ paused: true, message: null, untilUtc: LATER }, false, NOW);
    expect(state.paused && state.notice).toBe(
      'Uploads are paused for maintenance until 31 Oct, 11:30 pm IST. You can still open bookings and work your tasks.');
  });

  it('ends by itself once its time has passed, without waiting for the next read', () => {
    expect(uploadPauseState({ paused: true, message: null, untilUtc: EARLIER }, false, NOW)).toEqual({ paused: false });
    expect(uploadPauseState({ paused: true, message: null, untilUtc: NOW.toISOString() }, false, NOW)).toEqual({ paused: false });
  });

  it('formats IST and ignores a time it cannot read', () => {
    expect(istTime(LATER)).toBe('31 Oct, 11:30 pm IST');
    expect(istTime('not a time')).toBeNull();
    expect(pauseNotice('not a time')).toBe('Uploads are paused for maintenance. You can still open bookings and work your tasks.');
  });
});

describe('a refused upload', () => {
  it('shows the server\'s message for a paused refusal, the usual message otherwise', () => {
    expect(isUploadPausedError(pausedRefusal())).toBe(true);
    expect(uploadErrorText(pausedRefusal(), 'fallback')).toBe(
      'We are correcting bookings. Uploads are back at 31 Oct 2026, 11:30 PM IST.');
    const other = new AuditCoreHttpError(503, { errorCode: 'VAC-SYS-002', detail: 'Storage is down.' });
    expect(isUploadPausedError(other)).toBe(false);
    expect(uploadErrorText(other, 'fallback')).toBe(other.message);
    expect(uploadErrorText(new Error('network down'), 'fallback')).toBe('network down');
    expect(uploadErrorText('??', 'fallback')).toBe('fallback');
  });

  it('marks the files of a paused refusal so the screen reads the status again', async () => {
    const file = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf', lastModified: 1 });
    const item: UploadItem = { id: 'a', file, clientUploadId: stableClientUploadId('j1', file), phase: 'WAITING', progress: 0 };
    const transport: UploadTransport = {
      init: async () => { throw pausedRefusal(); },
      put: async () => undefined,
      finalize: async () => undefined,
    };
    const [result] = await runUploads([item], transport, () => undefined);
    expect(result).toMatchObject({
      phase: 'FAILED', paused: true,
      error: 'We are correcting bookings. Uploads are back at 31 Oct 2026, 11:30 PM IST.',
    });
    const offline: UploadTransport = { ...transport, init: async () => { throw new Error('network down'); } };
    const [again] = await runUploads([item], offline, () => undefined);
    expect(again).toMatchObject({ phase: 'FAILED', error: 'network down' });
    expect(again.paused).toBeUndefined();
  });
});

describe('the SuperAdmin switch', () => {
  it('pauses all Projects with an optional message and IST time', () => {
    expect(pauseAllCommand({ message: '  Correcting   bookings ', until: '' }, NOW)).toEqual({
      command: { tenantId: null, paused: true, message: 'Correcting bookings', untilUtc: null },
    });
    expect(pauseAllCommand({ message: '', until: '2026-10-31T23:30' }, NOW)).toEqual({
      command: { tenantId: null, paused: true, message: null, untilUtc: '2026-10-31T23:30:00+05:30' },
    });
    expect(RESUME_ALL_COMMAND).toEqual({ tenantId: null, paused: false });
  });

  it('refuses a time that has passed, an unreadable time and a long message', () => {
    expect(pauseAllCommand({ message: '', until: '2026-10-31T20:00' }, NOW).error).toBe(
      'That time has already passed. Choose a later time.');
    expect(pauseAllCommand({ message: '', until: '31/10/2026' }, NOW).error).toBe(
      'Enter the time uploads are back as a date and time (IST).');
    expect(pauseAllCommand({ message: 'x'.repeat(501), until: '' }, NOW).error).toBe(
      'Keep the message within 500 characters.');
  });

  it('finds the all-Projects row and the Projects paused on their own', () => {
    const row = (tenantId: string | null, active: boolean) => ({
      tenantId, paused: active, active, message: null, untilUtc: null, setByActorId: 'sa', setAtUtc: EARLIER,
    });
    const rows = [row(null, false), row('t1', true), row('t2', false)];
    expect(allProjectsRow(rows)?.tenantId).toBeNull();
    expect(allProjectsRow([])).toBeUndefined();
    expect(projectPauses(rows).map((r) => r.tenantId)).toEqual(['t1']);
  });
});
