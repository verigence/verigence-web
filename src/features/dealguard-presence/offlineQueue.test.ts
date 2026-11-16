import { describe, expect, it } from 'vitest';

import { MAX_QUEUED, addToQueue, newClientCheckId, parseQueue, pruneQueue, type QueuedCheck } from './offlineQueue';

const NOW = Date.parse('2026-11-16T09:00:00Z');
const item = (id: string, hoursAgo: number): QueuedCheck => ({
  tenantId: 't1', clientCheckId: id, capturedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
  outcome: 'LOCATED', latitude: 20.49, longitude: 85.88, accuracyM: 15, source: 'NATIVE', deviceType: 'ANDROID',
});

describe('DealGuard checks kept offline', () => {
  it('keeps checks newest last, once each, and drops what the server would refuse', () => {
    let queue = addToQueue([], item('a', 3), NOW);
    queue = addToQueue(queue, item('b', 1), NOW);
    queue = addToQueue(queue, item('a', 3), NOW);
    expect(queue.map((q) => q.clientCheckId)).toEqual(['b', 'a']);
    expect(pruneQueue([item('old', 49), item('new', 2)], NOW).map((q) => q.clientCheckId)).toEqual(['new']);
    expect(pruneQueue([{ ...item('x', 1), capturedAt: 'not a date' }], NOW)).toEqual([]);
  });

  it('holds at most the newest checks', () => {
    let queue: QueuedCheck[] = [];
    for (let i = 0; i < MAX_QUEUED + 5; i += 1) queue = addToQueue(queue, item(`c${i}`, 1), NOW);
    expect(queue).toHaveLength(MAX_QUEUED);
    expect(queue[0].clientCheckId).toBe('c5');
  });

  it('reads stored lists defensively and makes ids the server accepts', () => {
    expect(parseQueue('{bad')).toEqual([]);
    expect(parseQueue(JSON.stringify([{ tenantId: 't' }, item('ok', 1)])).map((q) => q.clientCheckId)).toEqual(['ok']);
    const id = newClientCheckId();
    expect(id).toMatch(/^[A-Za-z0-9_.:-]{8,64}$/);
    expect(newClientCheckId()).not.toBe(id);
  });
});
