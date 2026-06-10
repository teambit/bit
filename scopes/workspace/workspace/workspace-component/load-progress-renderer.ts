import type { Logger } from '@teambit/logger';
import type { LoadEventEmitter } from '../component-loader';

/**
 * Threshold for surfacing a progress line. Single-component `get` calls and
 * tiny batches (a few components) generate too much status-line churn — they
 * flicker, drown out other messages, and are rarely interesting because the
 * load completes before the user can read them. Only batches at least this
 * large get a progress line.
 */
const MIN_BATCH_FOR_PROGRESS = 10;

/**
 * Minimum interval between intermediate progress updates. Humans can't read
 * updates faster than this anyway, and rate-limiting keeps the redirected
 * output (e.g. CI logs) readable. The first and last events always render
 * regardless.
 */
const UPDATE_INTERVAL_MS = 100;

/**
 * Subscribes to a workspace `LoadEventEmitter` and renders per-component
 * progress through the existing `Logger.setStatusLine` mechanism.
 *
 * Output during a `getMany` call of at least `MIN_BATCH_FOR_PROGRESS`
 * components (one line, replaced as components complete):
 *   `loading 12/311 (dependencies)`
 *
 * Behaviour:
 *  - Tracks one in-flight call at a time. Nested calls (e.g. an inner
 *    `get(id)` inside a `getMany` worker) are ignored so they don't clobber
 *    the outer batch's progress line. The outer line resumes once the inner
 *    finishes.
 *  - Stays silent on small batches and single-component loads — the threshold
 *    suppresses what would otherwise be thousands of status-line writes
 *    during a single command.
 *  - Does NOT call `clearStatusLine` on `load:end`; the next caller (status,
 *    list, install, etc.) typically replaces the line with its own message.
 */
export function attachLoadProgressRenderer(events: LoadEventEmitter, logger: Logger): void {
  let total = 0;
  let completed = 0;
  let activeCallId: string | undefined;
  let lastUpdateAt = 0;

  events.on((event) => {
    switch (event.kind) {
      case 'load:start':
        // Ignore inner calls while an outer batch is in flight, so single-
        // component fetches inside a `getMany` worker don't clobber the
        // outer progress line.
        if (activeCallId !== undefined) return;
        if (event.ids.length < MIN_BATCH_FOR_PROGRESS) return;
        activeCallId = event.callId;
        total = event.ids.length;
        completed = 0;
        lastUpdateAt = Date.now();
        logger.setStatusLine(`loading 0/${total} (${event.phase})`);
        break;

      case 'load:component': {
        if (event.callId !== activeCallId) return;
        completed += 1;
        const now = Date.now();
        // Always render the last update; render intermediates rate-limited.
        const isLast = completed === total;
        if (isLast || now - lastUpdateAt >= UPDATE_INTERVAL_MS) {
          logger.setStatusLine(`loading ${completed}/${total} (${event.phase})`);
          lastUpdateAt = now;
        }
        break;
      }

      case 'load:end':
        if (event.callId !== activeCallId) return;
        activeCallId = undefined;
        total = 0;
        completed = 0;
        break;

      // load:phase:start / load:phase:end are not surfaced — the per-phase
      // detail is already encoded in each load:component event.
      default:
        break;
    }
  });
}
