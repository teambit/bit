import { AsyncLocalStorage } from 'async_hooks';
import { types } from 'util';
import type * as Sources from '@teambit/component.sources';
import { withRustSnapshotTransaction } from './rust-snapshot-transaction';
import { registerRustSnapshotFunctionReference } from './rust-snapshot-guards';

type Session = Parameters<Parameters<typeof Sources.withWorkspaceSession>[0]>[0];
type Owner = {
  session?: Session;
  closing: boolean;
  requests: Promise<void>;
  cleanups: Array<() => void | Promise<void>>;
};
const owners = new AsyncLocalStorage<Owner>();
const stringify = JSON.stringify;
const maximumBytes = 4 * 1024 * 1024;

function serializationAvailable(): boolean {
  return (
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === stringify &&
    !Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') &&
    !Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  );
}

/** Plain bounded metadata only: owned Source and merged bodies stay in private Native spools. */
function metadata(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || types.isProxy(value) || depth > 64 || seen.has(value)) return false;
  const array = Array.isArray(value);
  if (
    array
      ? Object.getPrototypeOf(value) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const keys = Reflect.ownKeys(value);
  const length = array ? Object.getOwnPropertyDescriptor(value, 'length')?.value : undefined;
  if (
    keys.length > 16385 ||
    (array && (!Number.isSafeInteger(length) || length < 0 || length > 16384 || keys.length !== length + 1))
  )
    return false;
  seen.add(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (array && key === 'length') continue;
    if (
      typeof key !== 'string' ||
      !('value' in descriptor) ||
      !descriptor.enumerable ||
      (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) ||
      !metadata(descriptor.value, seen, depth + 1)
    )
      return false;
  }
  seen.delete(value);
  return true;
}

export function isRustMergeTransactionOperation(): boolean {
  const owner = owners.getStore();
  return process.env.BIT_RUST_CLIENT_VCS === 'on' && Boolean(owner && !owner.closing && owner.session?.usable);
}
registerRustSnapshotFunctionReference('MergeTransactionOperationActive', isRustMergeTransactionOperation);

/** Pure preflight before public clone/model prefixes or any private filesystem await. */
export function canRequestRustMergeTransaction(): boolean {
  return isRustMergeTransactionOperation() && serializationAvailable();
}
registerRustSnapshotFunctionReference('MergeTransactionTransportAvailable', canRequestRustMergeTransaction);

export function registerRustMergeTransactionCleanup(cleanup: () => void | Promise<void>): boolean {
  const owner = owners.getStore();
  if (!owner || !isRustMergeTransactionOperation()) return false;
  owner.cleanups[owner.cleanups.length] = cleanup;
  return true;
}

export async function retireRustMergeTransaction(): Promise<void> {
  const owner = owners.getStore();
  if (!owner) return;
  owner.closing = true;
  await owner.requests;
  await owner.session?.dispose();
  const sources = require('@teambit/component.sources') as typeof Sources;
  await sources.retireRustWorkspaceEngine(true);
}

/** Nested callbacks borrow one physical engine; only protocol requests are serialized. */
export function withRustMergeTransactionOperation<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  // Compiled exports are lazy: component-to-main status can run before any model
  // export is read. Load the defining model module so its original registrations
  // exist before eligibility checks; never register observed caller values here.
  require('../models');
  const sources = require('@teambit/component.sources') as typeof Sources;
  return sources.withWorkspacePersistence(() =>
    sources.withRustWorkspaceEngine(async () => {
      const owner: Owner = { closing: false, requests: Promise.resolve(), cleanups: [] };
      const run = () => owners.run(owner, () => withRustSnapshotTransaction(() => sources.withRustSourceReads(action)));
      let entered = false;
      const result = await sources.withWorkspaceSession(async (session) => {
        entered = true;
        owner.session = session;
        try {
          return await run();
        } finally {
          owner.closing = true;
          await owner.requests;
          for (let index = owner.cleanups.length - 1; index >= 0; index--) {
            try {
              await owner.cleanups[index]();
            } catch {
              /* Private cleanup preserves the original public failure. */
            }
          }
        }
      });
      return entered ? (result as T) : run();
    })
  );
}

export function requestRustMergeTransaction<T>(
  input: object,
  validate: (data: any) => boolean
): Promise<T | undefined> {
  const owner = owners.getStore();
  if (!owner || !isRustMergeTransactionOperation() || !serializationAvailable() || !metadata(input))
    return Promise.resolve(undefined);
  const bytes = Buffer.from(stringify(input));
  if (!bytes.length || bytes.length > maximumBytes) return Promise.resolve(undefined);
  const request = owner.requests.then(async () => {
    if (!isRustMergeTransactionOperation() || !owner.session) return undefined;
    const session = owner.session;
    let result: T | undefined;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !response.data || !validate(response.data)) return false;
        result = response.data as T;
        return true;
      },
      maximumBytes
    );
    if (owner.closing || result === undefined) {
      owner.closing = true;
      await session.dispose();
      return undefined;
    }
    return result;
  });
  owner.requests = request.then(
    () => undefined,
    () => undefined
  );
  return request;
}

/** Finish retained plans while their durable bodies remain available for escaped public SourceFiles. */
export function retainRustMergeTransactionToken(kind: string, token: string): boolean {
  const owner = owners.getStore();
  if (
    !owner ||
    !isRustMergeTransactionOperation() ||
    !serializationAvailable() ||
    !/^[a-f0-9]{40}$/.test(token) ||
    !/^merge[A-Za-z]+Finish$/.test(kind)
  )
    return false;
  const bytes = Buffer.from(stringify({ kind, token }));
  owner.cleanups[owner.cleanups.length] = async () => {
    if (!owner.session?.usable) return;
    let finished = false;
    await owner.session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        finished = response.completed === 1 && (response.data as { finished?: boolean } | undefined)?.finished === true;
        return finished;
      },
      maximumBytes
    );
    if (!finished) await owner.session.dispose();
  };
  return true;
}

export type MergeTransactionPhase = { phase: string; index: number; count: number };
export type MergeTransactionCursor = { token: string; revision: number; directive: MergeTransactionPhase };
const journals = new AsyncLocalStorage<MergeTransactionCursor>();
const journalModes = new WeakMap<MergeTransactionCursor, 'status' | 'apply' | 'lane'>();
export function canUseRustMergeTransactionMode(mode: 'status' | 'apply' | 'lane'): boolean {
  const state = journals.getStore();
  return isRustMergeTransactionOperation() && Boolean(state && journalModes.get(state) === mode);
}
export function getRustMergeTransactionToken(): string | undefined {
  return isRustMergeTransactionOperation() ? journals.getStore()?.token : undefined;
}
const tokenHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function cursor(value: any): value is MergeTransactionCursor {
  return Boolean(
    value &&
      tokenHash(value.token) &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      value.directive &&
      typeof value.directive.phase === 'string' &&
      Number.isSafeInteger(value.directive.index) &&
      value.directive.index >= 0 &&
      Number.isSafeInteger(value.directive.count) &&
      value.directive.count >= 0 &&
      value.directive.count <= 4096
  );
}

export async function withRustMergeTransactionJournal<T>(
  options: { mode: 'status' | 'apply' | 'lane'; count: number; importMain?: boolean },
  action: () => Promise<T>
): Promise<T> {
  if (!isRustMergeTransactionOperation()) return action();
  const parent = journals.getStore();
  const state = await requestRustMergeTransaction<MergeTransactionCursor>(
    {
      kind: 'mergeTransactionBegin',
      ...options,
      ...(parent ? { parentToken: parent.token } : {}),
    },
    (data) => cursor(data) && data.revision === 0
  );
  if (!state || !retainRustMergeTransactionToken('mergeTransactionFinish', state.token)) return action();
  journalModes.set(state, options.mode);
  return journals.run(state, action);
}

/** Receipt completed canonical effects; a failed receipt never replays those effects. */
export async function completeRustMergeTransactionPhase(
  phase: string,
  completed?: number,
  nextCount?: number
): Promise<void> {
  const state = journals.getStore();
  if (!state || !isRustMergeTransactionOperation() || state.directive.phase !== phase) return;
  const next = await requestRustMergeTransaction<MergeTransactionCursor>(
    {
      kind: 'mergeTransactionReceipt',
      token: state.token,
      revision: state.revision,
      phase,
      index: state.directive.index,
      completed: completed === undefined ? state.directive.count : completed,
      ...(nextCount === undefined ? {} : { nextCount }),
    },
    (data) => cursor(data) && data.token === state.token && data.revision === state.revision + 1
  );
  if (next) Object.assign(state, next);
}

export type MergeStatusObservation =
  | 'model'
  | 'unmerged'
  | 'incoming'
  | 'removeOnMain'
  | 'mainHead'
  | 'currentId'
  | 'locallyRemoved'
  | 'current'
  | 'removedMain'
  | 'removedDivergence'
  | 'modified'
  | 'divergence'
  | 'unrelated'
  | 'unrelatedFailure';
export type RustMergeStatusResult = {
  action: 'unchanged' | 'target' | 'merge' | 'detach' | 'unrelated';
  message?: string;
  legitimate?: boolean;
  shouldBeRemoved?: boolean;
  unrelated?: {
    strategy: string;
    head: 'current' | 'other';
    unrelatedHead: 'current' | 'other';
    lane: 'current' | 'other';
  };
};
export type RustMergeStatusCursor = {
  token: string;
  revision: number;
  directive?: { observe: MergeStatusObservation; selector: 'bitmap' | 'lane' | 'main' | 'none' };
  result?: RustMergeStatusResult;
};
const statusObservations: MergeStatusObservation[] = [
  'model',
  'unmerged',
  'incoming',
  'removeOnMain',
  'mainHead',
  'currentId',
  'locallyRemoved',
  'current',
  'removedMain',
  'removedDivergence',
  'modified',
  'divergence',
  'unrelated',
  'unrelatedFailure',
];

function statusCursor(value: any): value is RustMergeStatusCursor {
  if (!value || !tokenHash(value.token) || !Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  const directive = value.directive;
  if (directive)
    return (
      statusObservations.includes(directive.observe) && ['bitmap', 'lane', 'main', 'none'].includes(directive.selector)
    );
  const result = value.result;
  return Boolean(
    result &&
      ['unchanged', 'target', 'merge', 'detach', 'unrelated'].includes(result.action) &&
      (result.message === undefined || typeof result.message === 'string') &&
      (result.legitimate === undefined || typeof result.legitimate === 'boolean') &&
      (result.shouldBeRemoved === undefined || typeof result.shouldBeRemoved === 'boolean') &&
      (!result.unrelated ||
        (typeof result.unrelated.strategy === 'string' &&
          ['current', 'other'].includes(result.unrelated.head) &&
          ['current', 'other'].includes(result.unrelated.unrelatedHead) &&
          ['current', 'other'].includes(result.unrelated.lane)))
  );
}

export async function beginRustMergeStatus(input: {
  index: number;
  id: string;
  idWithoutVersion: string;
  hasConsumer: boolean;
  hasWorkspace: boolean;
}): Promise<RustMergeStatusCursor | undefined> {
  const state = journals.getStore();
  if (!state || state.directive.phase !== 'status') return undefined;
  return requestRustMergeTransaction<RustMergeStatusCursor>(
    { kind: 'mergeStatusBegin', token: state.token, ...input },
    (data) => statusCursor(data) && data.revision === 0 && data.directive?.observe === 'model'
  );
}

export async function observeRustMergeStatus(
  state: RustMergeStatusCursor | undefined,
  observation: MergeStatusObservation,
  value: object
): Promise<RustMergeStatusCursor | undefined> {
  if (!state || state.directive?.observe !== observation) return undefined;
  const next = await requestRustMergeTransaction<RustMergeStatusCursor>(
    {
      kind: 'mergeStatusReceipt',
      token: state.token,
      revision: state.revision,
      observe: observation,
      value,
    },
    (data) => statusCursor(data) && data.token === state.token && data.revision === state.revision + 1
  );
  if (!next) return undefined;
  state.directive = next.directive;
  state.result = next.result;
  state.revision = next.revision;
  return state;
}
