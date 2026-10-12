import { AsyncLocalStorage } from 'async_hooks';
import { acquireWorkspaceSession, type MaterializationSession } from './rust-workspace-materializer';

type Lease = NonNullable<ReturnType<typeof acquireWorkspaceSession>>;
type Owner = {
  identity: object;
  lease?: Lease;
  session?: MaterializationSession;
  requests: Promise<void>;
  cleanup: Array<() => void | Promise<void>>;
  failed: boolean;
  closed: boolean;
};
const owners = new AsyncLocalStorage<Owner>();
const borrowed = new WeakSet<MaterializationSession>();

/** One process owns repository, inspection and filesystem state for an awaited workspace transition. */
export async function withRustWorkspaceEngine<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  const owner: Owner = { identity: {}, requests: Promise.resolve(), cleanup: [], failed: false, closed: false };
  owner.lease = acquireWorkspaceSession();
  if (owner.lease) owner.session = borrow(owner, owner.lease.session);
  else owner.failed = true;
  let failed = false;
  let failure: unknown;
  let result: T | undefined;
  try {
    result = await owners.run(owner, action);
  } catch (error) {
    failed = true;
    failure = error;
  }
  owner.closed = true;
  await owner.requests;
  for (const cleanup of owner.cleanup.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  try {
    await owner.lease?.release();
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  if (failed) throw failure;
  return result as T;
}

/** Private compatibility state survives helper loss and is cleaned up in reverse acquisition order. */
export function registerRustWorkspaceEngineCleanup(cleanup: () => void | Promise<void>): boolean {
  const owner = owners.getStore();
  if (!owner || owner.closed) return false;
  owner.cleanup.push(cleanup);
  return true;
}

export function isRustWorkspaceEngine(): boolean {
  const owner = owners.getStore();
  return Boolean(
    process.env.BIT_RUST_CLIENT_VCS === 'on' && owner && !owner.failed && !owner.closed && owner.session?.usable
  );
}

export function hasRustWorkspaceEngineOwner(): boolean {
  return Boolean(owners.getStore());
}

export async function retireRustWorkspaceEngine(cleanupBeforeReturning = false): Promise<void> {
  const owner = owners.getStore();
  if (!owner) return;
  owner.failed = true;
  await owner.lease?.session.dispose();
  if (cleanupBeforeReturning) {
    // Interactive adapters can leave their promise unsettled on stdin EOF.
    // Hydrate escaped values before deleting their backing files, even then.
    await owner.requests;
    let failure: unknown;
    let failed = false;
    for (const cleanup of owner.cleanup.splice(0).reverse()) {
      try {
        await cleanup();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  }
}

/** Undefined means this owner has retired; callers must not acquire a replacement process. */
export function workspaceEngineSession(): { owned: boolean; session?: MaterializationSession; executable?: string } {
  const owner = owners.getStore();
  if (!owner) return { owned: false };
  return {
    owned: true,
    session: !owner.failed && !owner.closed && owner.session?.usable ? owner.session : undefined,
    executable: owner.lease?.executable,
  };
}

export function isBorrowedWorkspaceEngineSession(session: MaterializationSession): boolean {
  return borrowed.has(session);
}

export function workspaceEngineIdentity(): object | undefined {
  const owner = owners.getStore();
  return owner && !owner.closed ? owner.identity : undefined;
}

function borrow(owner: Owner, physical: MaterializationSession): MaterializationSession {
  const session = Object.create(physical) as MaterializationSession;
  borrowed.add(session);
  Object.defineProperties(session, {
    usable: { get: () => !owner.failed && !owner.closed && physical.usable },
    dispose: {
      value: async () => {
        // Dispose the physical request immediately; waiting on our own request queue here can deadlock.
        owner.failed = true;
        await physical.dispose();
      },
    },
    request: {
      value: (...args: Parameters<MaterializationSession['request']>) => {
        if (owner.failed || owner.closed || !physical.usable) return Promise.resolve(undefined);
        const request = owner.requests.then(async () => {
          if (owner.failed || owner.closed || !physical.usable) return undefined;
          try {
            const result = await physical.request(...args);
            if (!physical.usable || result === undefined) {
              owner.failed = true;
              await physical.dispose();
            }
            return result;
          } catch (error) {
            owner.failed = true;
            await physical.dispose();
            throw error;
          }
        });
        owner.requests = request.then(
          () => undefined,
          () => {
            owner.failed = true;
          }
        );
        return request;
      },
    },
  });
  return session;
}
