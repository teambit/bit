import { AsyncLocalStorage } from 'async_hooks';
import type * as Sources from '@teambit/component.sources';
import { isRustSnapshotOperation, withRustSnapshotOperation } from './rust-snapshot';

type Session = Parameters<Parameters<typeof Sources.withWorkspaceSession>[0]>[0];
type Owner = {
  session?: Session;
  requests: Promise<void>;
  retiring?: Promise<void>;
  cleanups: Set<() => Promise<void>>;
};
const owners = new AsyncLocalStorage<Owner>();
const maximumBytes = 4 * 1024 * 1024;
const defaultStringify = JSON.stringify;

function hasDefaultTransportSerialization(): boolean {
  return (
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === defaultStringify &&
    !Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') &&
    !Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  );
}

export function isRustSnapshotTransaction(): boolean {
  const owner = owners.getStore();
  return isRustSnapshotOperation() && !owner?.retiring && owner?.session?.usable === true;
}

export function registerRustSnapshotTransactionCleanup(action: () => Promise<void>): boolean {
  const owner = owners.getStore();
  if (!owner) return false;
  owner.cleanups.add(action);
  return true;
}

export async function retireRustSnapshotTransaction(): Promise<void> {
  const owner = owners.getStore();
  if (!owner?.session) return;
  owner.retiring ||= owner.requests.then(() => owner.session!.dispose());
  await owner.retiring;
}

/** One pinned helper owns snapshot planning, serialization and commit receipts. */
export function withRustSnapshotTransaction<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  return withRustSnapshotOperation(async () => {
    const owner: Owner = { requests: Promise.resolve(), cleanups: new Set() };
    const run = () => owners.run(owner, action);
    const { withWorkspaceSession } = require('@teambit/component.sources') as typeof Sources;
    let entered = false;
    const result = await withWorkspaceSession(async (session) => {
      entered = true;
      owner.session = session;
      try {
        return await run();
      } finally {
        await owner.requests;
        for (const cleanup of owner.cleanups) await cleanup().catch(() => undefined);
      }
    });
    return entered ? (result as T) : run();
  });
}

/** A failed session stays retired; callers resume only the remaining canonical suffix. */
export function requestRustSnapshotTransaction<T>(
  input: object,
  validate: (data: any) => boolean
): Promise<T | undefined> {
  const owner = owners.getStore();
  if (!owner?.session || !isRustSnapshotOperation()) return Promise.resolve(undefined);
  const session = owner.session;
  const request = owner.requests.then(async () => {
    if (!session.usable || owner.retiring) return undefined;
    if (!hasDefaultTransportSerialization()) {
      await session.dispose();
      return undefined;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(defaultStringify(input));
    } catch {
      return undefined;
    }
    if (!bytes.length || bytes.length > maximumBytes) return undefined;
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
    if (!result || (result as any).failed === true) await session.dispose();
    return result;
  });
  owner.requests = request.then(
    () => undefined,
    () => undefined
  );
  return request;
}

export type SnapshotPhase =
  | 'initialize'
  | 'preSnap'
  | 'prepareVersions'
  | 'captureLane'
  | 'softTag'
  | 'flattenDependencies'
  | 'addObjects'
  | 'updateWorkspace'
  | 'stagedWrite'
  | 'hydrateBuild'
  | 'removeWorkspace'
  | 'addLane'
  | 'persist'
  | 'mergeConfigCleanup'
  | 'linkWorkspace'
  | 'clearCache';
type Directive = { kind: SnapshotPhase | 'done'; index: number; count: number };
type Journal = { token: string; revision: number; directive: Directive };
const ordinaryPhases: SnapshotPhase[] = [
  'initialize',
  'preSnap',
  'prepareVersions',
  'captureLane',
  'flattenDependencies',
  'addObjects',
  'updateWorkspace',
  'stagedWrite',
  'hydrateBuild',
  'removeWorkspace',
  'addLane',
  'persist',
  'mergeConfigCleanup',
  'linkWorkspace',
  'clearCache',
];
const softPhases: SnapshotPhase[] = ['initialize', 'preSnap', 'prepareVersions', 'captureLane', 'softTag'];
function sameDirective(actual: any, expected: Directive): boolean {
  return actual?.kind === expected.kind && actual.index === expected.index && actual.count === expected.count;
}
function journalReply(data: any, expected: Directive, token?: string, revision = 0): boolean {
  return (
    typeof data?.token === 'string' &&
    /^[a-f0-9]{40}$/.test(data.token) &&
    (!token || data.token === token) &&
    data.revision === revision &&
    sameDirective(data.directive, expected)
  );
}
function nextCanonicalDirective(current: Directive, soft: boolean, componentCount: number): Directive {
  if (current.kind === 'updateWorkspace' && current.index + 1 < componentCount)
    return { kind: 'addObjects', index: current.index + 1, count: 1 };
  const sequence = soft ? softPhases : ordinaryPhases;
  let next = sequence.indexOf(current.kind as SnapshotPhase) + 1;
  if (sequence[next] === 'addObjects' && componentCount === 0) next += 2;
  return {
    kind: sequence[next] || 'done',
    index: sequence[next] === 'updateWorkspace' ? current.index : 0,
    count: sequence[next] ? 1 : 0,
  };
}

/** Native directives own phase order; the local cursor preserves completed effects after helper loss. */
export async function runRustSnapshotPhases<T>(options: {
  soft: boolean | (() => boolean);
  eligible: () => boolean;
  componentCount: () => number;
  actions: Record<SnapshotPhase, (index: number) => Promise<void>>;
  result: () => T;
}): Promise<T> {
  return withRustSnapshotTransaction(async () => {
    const soft = () => (typeof options.soft === 'function' ? options.soft() : options.soft);
    let softMode = false;
    let current: Directive = { kind: 'initialize', index: 0, count: 1 };
    let native = options.eligible()
      ? await requestRustSnapshotTransaction<Journal>(
          { kind: 'snapshotTransactionBegin', soft: (softMode = soft()), count: 1 },
          (data) => journalReply(data, current)
        )
      : undefined;
    while (current.kind !== 'done') {
      if (!options.eligible()) native = undefined;
      const action = options.actions[current.kind];
      try {
        await action(current.index);
      } catch (error) {
        if (native) {
          const { token, revision } = native;
          await requestRustSnapshotTransaction(
            { kind: 'snapshotTransactionReceipt', token, revision, completed: 0, failed: true },
            (data) =>
              data.token === token &&
              data.revision === revision + 1 &&
              data.directive?.kind === 'failed' &&
              data.directive.phase === current.kind &&
              data.directive.index === current.index &&
              data.directive.completed === 0
          ).catch(() => undefined);
        }
        throw error;
      }
      if (!options.eligible()) native = undefined;
      const count = options.componentCount();
      if (current.kind === 'captureLane') softMode = soft();
      const next = nextCanonicalDirective(current, softMode, count);
      if (native) {
        const { token, revision } = native;
        // Commit the local cursor before waiting for the receipt: completed callbacks cannot replay.
        const completed = current.count;
        current = next;
        native = await requestRustSnapshotTransaction<Journal>(
          {
            kind: 'snapshotTransactionReceipt',
            token,
            revision,
            completed,
            failed: false,
            nextCount: ['flattenDependencies', 'updateWorkspace'].includes(native.directive.kind) ? count : 1,
          },
          (data) => journalReply(data, next, token, revision + 1)
        );
        if (native) current = native.directive;
      } else current = next;
    }
    return options.result();
  });
}
