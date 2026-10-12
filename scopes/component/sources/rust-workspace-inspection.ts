import { AsyncLocalStorage } from 'async_hooks';
import { withWorkspaceSession } from './rust-workspace-persistence';
import { isBorrowedWorkspaceEngineSession } from './rust-workspace-engine';

type Session = Parameters<Parameters<typeof withWorkspaceSession>[0]>[0];
type Owner = { session?: Session; requests: Promise<void>; failed: boolean };
const owners = new AsyncLocalStorage<Owner>();
const stringify = JSON.stringify;
const MAX_INPUT = 4 * 1024 * 1024;
const MAX_OUTPUT = 32 * 1024 * 1024;

function ordinaryTransport(): boolean {
  return (
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value === stringify &&
    !Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') &&
    !Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  );
}

/** Inspection snapshots share one helper and never escape their awaited operation. */
export async function withRustWorkspaceInspection<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on' || owners.getStore()) return action();
  const owner: Owner = { requests: Promise.resolve(), failed: false };
  let entered = false;
  const result = await withWorkspaceSession(async (session) => {
    entered = true;
    owner.session = session;
    try {
      return await owners.run(owner, action);
    } finally {
      await owner.requests;
      if (!isBorrowedWorkspaceEngineSession(session)) await session.dispose();
    }
  });
  return entered ? (result as T) : owners.run(owner, action);
}

export function isRustWorkspaceInspection(): boolean {
  const owner = owners.getStore();
  return process.env.BIT_RUST_CLIENT_VCS === 'on' && !owner?.failed && owner?.session?.usable === true;
}

/** Retired owners cannot acquire another helper or reuse stale snapshot tokens. */
export async function retireRustWorkspaceInspection(): Promise<void> {
  const owner = owners.getStore();
  if (!owner?.session) return;
  owner.failed = true;
  await owner.requests;
  await owner.session.dispose();
}

export function requestRustWorkspaceInspection<T>(
  input: object,
  validate: (value: any) => value is T
): Promise<T | undefined> {
  const owner = owners.getStore();
  if (!owner?.session || owner.failed) return Promise.resolve(undefined);
  const session = owner.session;
  const request = owner.requests.then(async () => {
    if (owner.failed || !session.usable) return undefined;
    if (!ordinaryTransport()) {
      owner.failed = true;
      await session.dispose();
      return undefined;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(stringify(input));
    } catch {
      return undefined;
    }
    if (!bytes.length || bytes.length > MAX_INPUT) return undefined;
    let result: T | undefined;
    try {
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
          if (response.failed) return true;
          if (response.completed !== 1 || !validate(response.data)) return false;
          result = response.data;
          return true;
        },
        MAX_OUTPUT
      );
    } catch {
      owner.failed = true;
      await session.dispose();
      return undefined;
    }
    if (result === undefined) {
      owner.failed = true;
      await session.dispose();
    }
    return result;
  });
  owner.requests = request.then(
    () => undefined,
    () => {
      owner.failed = true;
    }
  );
  return request;
}
