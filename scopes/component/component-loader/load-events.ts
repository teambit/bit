import { EventEmitter } from 'events';
import type { ComponentID } from '@teambit/component-id';
import type { Phase } from './phase';

/**
 * Discriminated union of progress events emitted during a component-load call.
 *
 * All events for a single `get`/`getMany` invocation share the same `callId` so subscribers
 * can correlate them. Events are emitted synchronously; with no subscribers the per-event
 * cost is bounded by a single `EventEmitter.emit` returning false.
 *
 * Event order for a `getMany` call:
 *   load:start                            (once)
 *     load:phase:start                    (once per phase actually executed)
 *       load:component                    (once per component completed at the requested phase)
 *     load:phase:end                      (once per phase actually executed)
 *   load:end                              (once)
 *
 * For a fully-cached `get`, only `load:start`, one `load:component` (with `cached: true`),
 * and `load:end` are emitted — no phase events fire.
 */
export type LoadEvent =
  | { kind: 'load:start'; callId: string; ids: ComponentID[]; phase: Phase }
  | { kind: 'load:phase:start'; callId: string; phase: Phase; ids: ComponentID[] }
  | { kind: 'load:component'; callId: string; id: ComponentID; phase: Phase; durationMs: number; cached: boolean }
  | { kind: 'load:phase:end'; callId: string; phase: Phase; durationMs: number }
  | { kind: 'load:end'; callId: string; durationMs: number; failures: ComponentID[] };

export type LoadEventListener = (event: LoadEvent) => void;

/**
 * Typed wrapper around Node's `EventEmitter` exposing a single `'event'` channel
 * carrying the discriminated `LoadEvent` union. Subscribers narrow on `event.kind`.
 */
export class LoadEventEmitter {
  private readonly emitter = new EventEmitter();

  on(listener: LoadEventListener): this {
    this.emitter.on('event', listener);
    return this;
  }

  off(listener: LoadEventListener): this {
    this.emitter.off('event', listener);
    return this;
  }

  once(listener: LoadEventListener): this {
    this.emitter.once('event', listener);
    return this;
  }

  emit(event: LoadEvent): boolean {
    return this.emitter.emit('event', event);
  }

  listenerCount(): number {
    return this.emitter.listenerCount('event');
  }

  removeAllListeners(): this {
    this.emitter.removeAllListeners('event');
    return this;
  }
}
