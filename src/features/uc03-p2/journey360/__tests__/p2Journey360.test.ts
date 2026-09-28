import { describe, expect, it } from 'vitest';

import { money, recordValue, signedMoney, varianceTone } from '../j360Format';
import { newPhotoItem, photoPreflight, runPhotoUploads, type PhotoTransport } from '../../photos/p2PhotoUploader';

describe('Journey 360 formatting', () => {
  it('never shows a missing amount as zero', () => {
    expect(money(null)).toBe('—');
    expect(money('0')).toContain('0');
    expect(signedMoney('5000')).toMatch(/^\+₹/);
    expect(signedMoney('-2000')).toMatch(/^−₹/);
    expect(signedMoney('0')).toBe('—');
  });

  it('colours variance by who it costs', () => {
    expect(varianceTone('-100')).toBe('is-adverse');
    expect(varianceTone('100', 'discount')).toBe('is-adverse');
    expect(varianceTone('100')).toBe('is-favourable');
    expect(varianceTone(null)).toBe('');
  });

  it('flattens add-on records for display', () => {
    expect(recordValue({ zero_dep: true, engine_protect: false })).toBe('Zero dep');
    expect(recordValue(['a', 'b'])).toBe('a, b');
    expect(recordValue(false)).toBe('No');
  });
});

describe('vehicle photo upload', () => {
  const photo = (name = 'front.jpg', type = 'image/jpeg') => new File([new Uint8Array([1, 2, 3])], name, { type, lastModified: 1 });

  it('accepts only photos', () => {
    expect(photoPreflight(photo())).toBeUndefined();
    expect(photoPreflight(photo('car.heic', ''))).toBeUndefined();
    expect(photoPreflight(photo('form.pdf', 'application/pdf'))).toMatch(/Only photos/);
  });

  it('keeps the same id for the same photo so retries never duplicate', () => {
    const file = photo();
    expect(newPhotoItem('j1', file).clientUploadId).toBe(newPhotoItem('j1', file).clientUploadId);
    expect(newPhotoItem('j1', file).clientUploadId).not.toBe(newPhotoItem('j2', file).clientUploadId);
  });

  it('uploads, retries a slow finalize and isolates failures', async () => {
    let finalizeCalls = 0;
    const transport: PhotoTransport = {
      intents: async (files) => files.map((f) => ({ clientUploadId: f.clientUploadId, uploadUrl: `u/${f.filename}`,
        uploadHeaders: {}, alreadyStored: false })),
      put: async (url) => { if (url.includes('bad')) throw new Error('network'); },
      finalize: async () => { finalizeCalls += 1; if (finalizeCalls === 1) throw new Error('not yet'); },
    };
    const good = newPhotoItem('j', photo('good.jpg'), 'FRONT', 0);
    const bad = newPhotoItem('j', photo('bad.jpg'), 'REAR', 1);
    const result = await runPhotoUploads([good, bad], transport, () => undefined, 2, async (f) => f);
    expect(result.find((i) => i.id === good.id)?.phase).toBe('DONE');
    expect(result.find((i) => i.id === bad.id)?.phase).toBe('FAILED');
    expect(finalizeCalls).toBe(2);
  });
});

describe('Task Queue grouping', () => {
  it('groups by journey, overdue journeys first', async () => {
    const { groupByJourney } = await import('../../tasks/p2TaskPlan');
    const base = { source_system: 'P2', round_number: 1, category: 'X', origin_kind: 'SYSTEM', source_type: 'RULE', description: '',
      reference: {}, severity: 'MEDIUM', assigned_role_code: 'PC', allowed_actions: [], completion_protocol: 'MACHINE_VERIFIED',
      task_status: 'READY', created_at_utc: '2026-09-01T00:00:00Z', updated_at_utc: '2026-09-01T00:00:00Z', task_type: 'T' } as const;
    const now = Date.parse('2026-09-28T00:00:00Z');
    const groups = groupByJourney([
      { ...base, task_id: 'a', journey_id: 'j1', title: 'A', due_at_utc: '2026-10-01T00:00:00Z', customer_name: 'One' },
      { ...base, task_id: 'b', journey_id: 'j2', title: 'B', due_at_utc: '2026-09-20T00:00:00Z', customer_name: 'Two' },
      { ...base, task_id: 'c', journey_id: 'j1', title: 'C', due_at_utc: '2026-09-30T00:00:00Z' },
    ], now);
    expect(groups.map((g) => g.journeyId)).toEqual(['j2', 'j1']);
    expect(groups[0].overdue).toBe(1);
    expect(groups[1].tasks.map((t) => t.task_id)).toEqual(['c', 'a']);
  });
});
