import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { hrErrorMessage } from '../../../services/hr/client';
import {
  sendMessages,
  type MessageChannel,
  type MessageTemplateCode,
  type SendMessageResult,
} from '../../../services/hr/messages';
import { messageKeys } from './messageKeys';
import { nothingWasSent, toBatches, type Recipient } from './messagePlan';

export type BatchStatus = 'waiting' | 'sending' | 'done' | 'failed';

export interface RunBatch {
  ids: string[];
  status: BatchStatus;
  results: SendMessageResult[];
  error?: string;
  /** True when the request failed in a way that leaves it unknown whether some people were sent. */
  maybeSent?: boolean;
}

export interface RunState {
  template: MessageTemplateCode;
  channel: MessageChannel;
  /** The people of this run, kept so results can be shown by name and the unsent can be chosen again. */
  people: Record<string, Recipient>;
  /** GENERAL only: the wording used, so "send the rest" sends the same message. */
  subject?: string;
  body?: string;
  batches: RunBatch[];
  phase: 'running' | 'done' | 'stopped' | 'failed';
}

export interface StartInput {
  template: MessageTemplateCode;
  channel: MessageChannel;
  people: Recipient[];
  /** GENERAL only: the wording for this one send. */
  subject?: string;
  body?: string;
}

/**
 * Sends one group of up to 5 people at a time, strictly one request after another. A request that
 * fails stops the run: nothing is retried automatically, so a person is never emailed (or given a
 * new password) twice by accident.
 */
export function useSendRun(accessToken: string | null) {
  const queryClient = useQueryClient();
  const [run, setRun] = useState<RunState | null>(null);
  const stopRequested = useRef(false);
  const busy = useRef(false);

  const patchBatch = (index: number, patch: Partial<RunBatch>) =>
    setRun((current) =>
      current ? { ...current, batches: current.batches.map((b, i) => (i === index ? { ...b, ...patch } : b)) } : current,
    );

  const start = useCallback(
    async (input: StartInput) => {
      if (busy.current || !accessToken) return;
      busy.current = true;
      stopRequested.current = false;
      const groups = toBatches(input.people.map((p) => p.userId));
      setRun({
        template: input.template,
        channel: input.channel,
        people: Object.fromEntries(input.people.map((p) => [p.userId, p])),
        subject: input.subject,
        body: input.body,
        batches: groups.map((ids) => ({ ids, status: 'waiting', results: [] })),
        phase: 'running',
      });
      let phase: RunState['phase'] = 'done';
      try {
        for (let i = 0; i < groups.length; i += 1) {
          if (stopRequested.current) {
            phase = 'stopped';
            break;
          }
          patchBatch(i, { status: 'sending' });
          try {
            const response = await sendMessages(accessToken, {
              channel: input.channel,
              template: input.template,
              user_ids: groups[i],
              ...(input.template === 'GENERAL' ? { subject: input.subject, body: input.body } : {}),
            });
            patchBatch(i, { status: 'done', results: response.results });
          } catch (problem) {
            patchBatch(i, { status: 'failed', error: hrErrorMessage(problem), maybeSent: !nothingWasSent(problem) });
            phase = 'failed';
            break;
          }
        }
      } finally {
        busy.current = false;
        setRun((current) => (current ? { ...current, phase } : current));
        void queryClient.invalidateQueries({ queryKey: messageKeys.logAll });
      }
    },
    [accessToken, queryClient],
  );

  const stopAfterThisGroup = useCallback(() => {
    stopRequested.current = true;
  }, []);

  const clear = useCallback(() => setRun(null), []);

  return { run, start, stopAfterThisGroup, clear };
}

/** Everyone whose group was not finished (waiting, or the group that failed). */
export function notFinishedIds(run: RunState): string[] {
  return run.batches.filter((b) => b.status !== 'done').flatMap((b) => b.ids);
}

/** People whose message did not go: failed, skipped or in a group that did not finish. */
export function notSentIds(run: RunState): string[] {
  const out: string[] = [];
  for (const batch of run.batches) {
    if (batch.status !== 'done') out.push(...batch.ids);
    else out.push(...batch.results.filter((r) => r.status !== 'SENT').map((r) => r.userId));
  }
  return Array.from(new Set(out));
}
