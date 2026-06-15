import { AsyncLocalStorage } from 'async_hooks';

export type SpanAttributes = Record<string, string | number | boolean | undefined>;

export type SpanEmitter = (span: LoadSpan, traceId: string) => void;

/**
 * a single timed unit of work within a load trace, e.g. "extension-merge" of one component.
 * spans nest, forming a tree under the trace's root span.
 */
export class LoadSpan {
  readonly children: LoadSpan[] = [];
  readonly attributes: SpanAttributes;
  /**
   * span names from the root to this span, e.g. "getMany > load-one > extension-merge". computed
   * once at construction (the parent chain is immutable) so reading it never re-walks the tree.
   */
  readonly path: string;
  durationMs?: number;
  private startTime: bigint;

  constructor(
    readonly name: string,
    readonly parent?: LoadSpan,
    attributes?: SpanAttributes
  ) {
    this.attributes = attributes || {};
    this.path = parent ? `${parent.path} > ${name}` : name;
    this.startTime = process.hrtime.bigint();
    if (parent) parent.children.push(this);
  }

  setAttribute(key: string, value: string | number | boolean | undefined) {
    this.attributes[key] = value;
  }

  end() {
    if (this.durationMs !== undefined) return; // already ended
    this.durationMs = Number(process.hrtime.bigint() - this.startTime) / 1_000_000;
  }

  toObject(): Record<string, any> {
    return {
      name: this.name,
      durationMs: this.durationMs !== undefined ? Math.round(this.durationMs * 100) / 100 : undefined,
      ...(Object.keys(this.attributes).length ? { attributes: this.attributes } : {}),
      ...(this.children.length ? { children: this.children.map((child) => child.toObject()) } : {}),
    };
  }
}

export type LoadFailure = {
  /**
   * id of the aspect/env/extension that failed to load.
   */
  failedId: string;
  /**
   * the load phase where the failure happened (e.g. "require-aspects").
   */
  phase: string;
  error: string;
};

/**
 * one trace per top-level component/aspect load request. nested loads triggered during the
 * request join this trace as child spans instead of starting their own.
 */
export class LoadTrace {
  readonly id: string;
  readonly rootSpan: LoadSpan;
  /**
   * load errors that were swallowed (best-effort loading). collected here by deep loader code
   * that doesn't have the affected components in hand; the component loader later attaches them
   * to the matching components as issues.
   */
  readonly loadFailures: LoadFailure[] = [];

  constructor(entry: string, attributes?: SpanAttributes) {
    this.id = Math.random().toString(36).slice(2, 8);
    this.rootSpan = new LoadSpan(entry, undefined, attributes);
  }
}

type TraceStore = { trace: LoadTrace; span: LoadSpan };

const traceStorage = new AsyncLocalStorage<TraceStore>();

let spanEmitter: SpanEmitter | undefined;

/**
 * register a callback invoked whenever a span closes (used by the logger to emit spans at
 * trace level without creating a circular dependency between this module and the logger).
 */
export function setSpanEmitter(emitter: SpanEmitter) {
  spanEmitter = emitter;
}

export function currentLoadTrace(): LoadTrace | undefined {
  return traceStorage.getStore()?.trace;
}

/**
 * report a swallowed (best-effort) load failure to the active trace. deduped by
 * (failedId, phase). no-op when no trace is active. returns whether the report was recorded.
 */
export function reportLoadFailure(failure: LoadFailure): boolean {
  const trace = traceStorage.getStore()?.trace;
  if (!trace) return false;
  const exists = trace.loadFailures.some(
    (existing) => existing.failedId === failure.failedId && existing.phase === failure.phase
  );
  if (!exists) trace.loadFailures.push(failure);
  return true;
}

export function currentLoadSpan(): LoadSpan | undefined {
  return traceStorage.getStore()?.span;
}

/**
 * prefix for log messages emitted while a load trace is active. empty string otherwise.
 */
export function getLoadTraceLogPrefix(): string {
  const store = traceStorage.getStore();
  if (!store) return '';
  return `[trace:${store.trace.id} ${store.span.path}] `;
}

/**
 * top-level entry points call this. starts a new trace if none is active, otherwise joins the
 * active trace as a child span. tracing never affects the result: the callback runs the same way
 * regardless of trace state.
 */
export async function startOrJoinLoadTrace<T>(
  entry: string,
  attributes: SpanAttributes,
  fn: (span: LoadSpan) => Promise<T>
): Promise<T> {
  const store = traceStorage.getStore();
  if (store) return loadSpan(entry, attributes, fn);
  const trace = new LoadTrace(entry, attributes);
  try {
    // capture the promise inside run() rather than relying on its return value, as older
    // @types/node versions (used by user envs compiling this module) type run() as void.
    let promise!: Promise<T>;
    traceStorage.run({ trace, span: trace.rootSpan }, () => {
      promise = fn(trace.rootSpan);
    });
    return await promise;
  } finally {
    trace.rootSpan.end();
    if (spanEmitter) spanEmitter(trace.rootSpan, trace.id);
  }
}

/**
 * record a timed span for a load stage. when no trace is active, runs the callback without
 * recording. the span is passed to the callback so stages can set attributes (e.g. cache hit).
 */
export async function loadSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: LoadSpan) => Promise<T>
): Promise<T> {
  const store = traceStorage.getStore();
  if (!store) return fn(new LoadSpan(name, undefined, attributes));
  const span = new LoadSpan(name, store.span, attributes);
  try {
    let promise!: Promise<T>;
    traceStorage.run({ trace: store.trace, span }, () => {
      promise = fn(span);
    });
    return await promise;
  } finally {
    span.end();
    if (spanEmitter) spanEmitter(span, store.trace.id);
  }
}
