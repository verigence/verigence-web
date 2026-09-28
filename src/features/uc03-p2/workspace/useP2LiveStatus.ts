import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { auditCoreRawRequest } from '../../../services/audit-core/client';
import type { P2DocumentsResponse, P2UploadCounts } from '../../../services/audit-core/uc03P2';

export type P2LiveUnit = {
  queueId: string;
  batchId: string;
  kind?: string | null;
  pageNumbers: number[];
  status: string;
  templateKey?: string | null;
  documentType?: string | null;
  documentId?: string | null;
  updatedAtUtc?: string | null;
};

export type P2LiveStatus = {
  counts: P2UploadCounts;
  units: P2LiveUnit[];
  stage?: { current_stage?: string; booking_completion_state?: string; delivery_completion_state?: string } | null;
};

export type SseMessage = { event: string; data: string };

/** Splits a Server-Sent Events buffer into complete messages and the rest. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const messages: SseMessage[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;  // keep-alive comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) messages.push({ event, data: data.join('\n') });
  }
  return { messages, rest };
}

/** Applies a pushed status to the cached documents response in place, so
 * the counts and each document's status change the moment the server says. */
export function applyLiveStatus(current: P2DocumentsResponse | undefined, live: P2LiveStatus): P2DocumentsResponse | undefined {
  if (!current) return current;
  const byId = new Map(live.units.map((unit) => [unit.queueId, unit]));
  const patch = <T extends { queueId: string; queue_status: string; templateKey?: string | null; classified_document_type?: string | null }>(page: T): T => {
    const unit = byId.get(page.queueId);
    if (!unit) return page;
    return {
      ...page,
      queue_status: unit.status,
      templateKey: unit.templateKey ?? page.templateKey,
      classified_document_type: unit.documentType ?? page.classified_document_type,
    };
  };
  return {
    ...current,
    counts: live.counts,
    batches: current.batches.map((batch) => ({
      ...batch,
      pages: batch.pages.map(patch),
      documents: batch.documents?.map((doc) => ({ ...patch(doc), memberPages: doc.memberPages.map(patch) })),
    })),
  };
}

/** Units the cache does not know yet (a new upload, a new grouped document). */
function hasUnknownUnits(current: P2DocumentsResponse | undefined, live: P2LiveStatus): boolean {
  if (!current) return true;
  const known = new Set<string>();
  for (const batch of current.batches) {
    batch.pages.forEach((page) => known.add(page.queueId));
    batch.documents?.forEach((doc) => known.add(doc.queueId));
  }
  return live.units.some((unit) => !known.has(unit.queueId));
}

/**
 * Live status of one Journey, pushed by Audit Core (Server-Sent Events):
 * every page uploaded, identified or read shows up at once -- no screen
 * refresh and no polling. The pushed counts and statuses are applied to the
 * screen immediately; the details (fields, checklist, tasks) reload in the
 * background right after. The stream reconnects by itself; ``connected``
 * is false only while it is down (the caller may then fall back to polling).
 */
export function useP2LiveStatus({
  tenantId,
  journeyId,
  accessToken,
  detailKeys,
}: {
  tenantId?: string;
  journeyId: string;
  accessToken?: string;
  detailKeys: unknown[][];
}): { connected: boolean; last?: P2LiveStatus } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<P2LiveStatus>();
  const keysRef = useRef(detailKeys);
  keysRef.current = detailKeys;

  useEffect(() => {
    if (!tenantId || !journeyId || !accessToken) return undefined;
    const controller = new AbortController();
    const documentsKey = ['p2-documents', tenantId, journeyId];
    let retry: number | undefined;
    let failures = 0;
    let first = true;

    const onStatus = (live: P2LiveStatus) => {
      setLast(live);
      const cached = queryClient.getQueryData<P2DocumentsResponse>(documentsKey);
      const unknown = hasUnknownUnits(cached, live);
      queryClient.setQueryData<P2DocumentsResponse>(documentsKey, (current) => applyLiveStatus(current, live));
      // The first message on (re)connect only confirms what is on screen.
      if (first && !unknown) { first = false; return; }
      first = false;
      keysRef.current.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
    };

    const connect = async () => {
      try {
        const response = await auditCoreRawRequest(
          `/p2/v1/tenants/${encodeURIComponent(tenantId)}/journeys/${encodeURIComponent(journeyId)}/live`,
          { accessToken, timeoutMs: 0, signal: controller.signal, headers: { Accept: 'text/event-stream' } },
        );
        if (!response.ok || !response.body) throw new Error(`live status unavailable (${response.status})`);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        setConnected(true);
        failures = 0;
        first = true;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const parsed = parseSse(buffer);
          buffer = parsed.rest;
          for (const message of parsed.messages) {
            if (message.event === 'status') onStatus(JSON.parse(message.data) as P2LiveStatus);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
      }
      if (controller.signal.aborted) return;
      setConnected(false);
      // A clean end (server asks to reconnect) comes back at once; errors back off.
      retry = window.setTimeout(() => void connect(), failures ? Math.min(15_000, 1_000 * 2 ** (failures - 1)) : 0);
    };

    void connect();
    return () => {
      controller.abort();
      if (retry !== undefined) window.clearTimeout(retry);
      setConnected(false);
    };
  }, [accessToken, journeyId, queryClient, tenantId]);

  return { connected, last };
}
