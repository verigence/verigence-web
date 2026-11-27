import { describe, expect, it } from 'vitest';
import { AuditCoreHttpError } from '../../../services/audit-core/client';
import { staleTaskMessage } from './staleTask';

const conflict = (detail: string) => new AuditCoreHttpError(409, { errorCode: 'VAC-CONFLICT-000', detail }, 'ref-1');

describe('staleTaskMessage', () => {
  it('explains a task that already closed itself', () => {
    expect(staleTaskMessage(conflict('This task is already verified complete.'))).toMatch(/already closed/);
  });
  it('explains a task already waiting for verification', () => {
    expect(staleTaskMessage(conflict('This task is waiting for verification; no further action is needed right now.')))
      .toMatch(/being checked/);
  });
  it('treats any other 409 as a reloaded task', () => {
    expect(staleTaskMessage(conflict('Conflict'))).toMatch(/reloaded/);
  });
  it('leaves other errors to the normal error text', () => {
    expect(staleTaskMessage(new AuditCoreHttpError(422, { detail: 'Write a comment.' }))).toBeUndefined();
    expect(staleTaskMessage(new Error('network'))).toBeUndefined();
  });
});
