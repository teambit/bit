import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs-extra';
import path from 'path';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { removeEmptyDir } from '@teambit/toolbox.fs.remove-empty-dir';
import { logger } from '@teambit/legacy.logger';
import { resolveRustObjectImportExecutable } from '@teambit/objects';
import { concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import type { DataToPersist } from './data-to-persist';
import { RemovePath, defaultRemovePath } from './remove-path';
import { Symlink, defaultSymlinkWrite } from './symlink';
import { removeFilesAndEmptyDirsRecursively } from './remove-files-and-empty-dirs-recursively';
import {
  acquireWorkspaceSession,
  hasNativeChunk,
  persistFilesInSession,
  type MaterializationSession,
} from './rust-workspace-materializer';

type Lease = NonNullable<ReturnType<typeof acquireWorkspaceSession>>;
type Entry = { lease: Lease; busy: boolean };
type Scope = { entries: Entry[]; closed: boolean };
type Action = { kind: number; first: string; second: string };
type PhaseMethods = Pick<DataToPersist, '_deletePathsFromFS' | '_persistFilesToFS' | '_persistSymlinksToFS'>;
const scopes = new AsyncLocalStorage<Scope>();

/** Inventory scans wait for an operation owner rather than starting helpers during Harmony bootstrap. */
export function isWorkspacePersistenceScope(): boolean {
  const scope = scopes.getStore();
  return Boolean(scope && !scope.closed);
}

function claimEntry(scope: Scope | undefined): Entry | undefined {
  if (scope?.closed) return undefined;
  const executable = resolveRustObjectImportExecutable();
  if (!executable) return undefined;
  let entry = scope?.entries.find(
    (candidate) => !candidate.busy && candidate.lease.session.usable && candidate.lease.executable === executable
  );
  if (entry) entry.busy = true;
  else {
    const lease = acquireWorkspaceSession();
    if (lease) {
      entry = { lease, busy: true };
      scope?.entries.push(entry);
    }
  }
  return entry;
}

async function releaseEntry(entry: Entry, scope: Scope | undefined) {
  if (scope && !scope.closed && entry.lease.session.usable) entry.busy = false;
  else {
    await entry.lease.release();
    if (scope) scope.entries.splice(scope.entries.indexOf(entry), 1);
  }
}

/** Share repository planning and materialization within one awaited operation. */
export async function withWorkspaceSession<T>(
  action: (session: MaterializationSession) => Promise<T>
): Promise<T | undefined> {
  const scope = scopes.getStore();
  const entry = claimEntry(scope);
  if (!entry) return undefined;
  try {
    return await action(entry.lease.session);
  } finally {
    await releaseEntry(entry, scope);
  }
}

/** Reuse bounded helpers throughout an awaited import/write operation; reap all of them on exit. */
export async function withWorkspacePersistence<T>(action: () => Promise<T>): Promise<T> {
  if (
    (process.env.BIT_RUST_WORKSPACE_PERSISTENCE !== 'on' && process.env.BIT_RUST_CLIENT_VCS !== 'on') ||
    scopes.getStore()
  )
    return action();
  const scope: Scope = { entries: [], closed: false };
  try {
    return await scopes.run(scope, action);
  } finally {
    scope.closed = true;
    await Promise.all(scope.entries.map(({ lease }) => lease.release()));
  }
}

/** Keep phase boundaries and extension methods in Node, with ordinary filesystem work in Rust. */
export async function persistWorkspaceOperation(data: DataToPersist, defaults: PhaseMethods): Promise<boolean> {
  if (
    (process.env.BIT_RUST_WORKSPACE_PERSISTENCE !== 'on' && process.env.BIT_RUST_CLIENT_VCS !== 'on') ||
    data._deletePathsFromFS !== defaults._deletePathsFromFS ||
    data._persistFilesToFS !== defaults._persistFilesToFS ||
    data._persistSymlinksToFS !== defaults._persistSymlinksToFS
  )
    return false;
  const scope = scopes.getStore();
  let entry: Entry | undefined;
  let attempted = false;
  const session = () => {
    if (attempted) return entry?.lease.session;
    attempted = true;
    entry = claimEntry(scope);
    return entry?.lease.session;
  };
  try {
    await removePaths(data.remove, session);
    // Snapshot at the canonical file-phase boundary: deletion hooks may add files.
    const files = data.files.slice();
    // Eligibility is checked inside persistFilesInSession, before each I/O chunk.
    // Avoid launching a helper for a wholly custom or non-overwriting file operation.
    await persistFiles(files, concurrentIOLimit(), session);
    await linkPaths(data.symlinks, session);
    return true;
  } finally {
    if (entry) await releaseEntry(entry, scope);
  }
}

async function persistFiles(
  files: DataToPersist['files'],
  concurrency: number,
  getSession: () => MaterializationSession | undefined
) {
  if (!files.length) return;
  // The materializer performs the same eligibility check before spawning in its legacy entry point.
  const native = hasNativeChunk(files, concurrency) ? getSession() : undefined;
  if (native) await persistFilesInSession(files, concurrency, native);
  else await pMapPool(files, (file) => file.write(), { concurrency });
}

async function removePaths(paths: RemovePath[], getSession: () => MaterializationSession | undefined) {
  const cleanup = paths.filter((item) => item.removeItsDirIfEmpty).map((item) => item.path);
  const ordinary = paths.filter((item) => !item.removeItsDirIfEmpty);
  if (cleanup.length) {
    const cleanupConcurrency = concurrentIOLimit();
    if (
      !cleanup.every(validPath) ||
      (cleanupConcurrency !== Infinity && (!Number.isInteger(cleanupConcurrency) || cleanupConcurrency < 1))
    )
      await removeFilesAndEmptyDirsRecursively(cleanup);
    else {
      logger.info(`remove-files-and-empty-dirs-recursively deleting the following paths: ${cleanup.join(', ')}`);
      const concurrency = cleanupConcurrency;
      await perform(
        cleanup.map((first) => ({ kind: 0, first, second: '' })),
        concurrency,
        getSession,
        async (action) => fs.remove(action.first)
      );
      await perform(
        cleanup
          .map((first) => path.dirname(first))
          .sort()
          .reverse()
          .map((first) => ({ kind: 1, first, second: '' })),
        1,
        getSession,
        async (action) => {
          await removeEmptyDir(action.first);
        }
      );
    }
  }
  const concurrency = concurrentIOLimit();
  if (!(concurrency >= 1)) {
    await pMapPool(ordinary, (item) => item.persistToFS(), { concurrency });
    return;
  }
  const width = Number.isFinite(concurrency) ? Math.floor(concurrency) : Math.max(ordinary.length, 1);
  for (let start = 0; start < ordinary.length; start += width) {
    const chunk = ordinary.slice(start, start + width);
    if (
      !chunk.every(
        (item) => item instanceof RemovePath && item.persistToFS === defaultRemovePath && validPath(item.path)
      )
    ) {
      await pMapPool(chunk, (item) => item.persistToFS(), { concurrency });
      continue;
    }
    await perform(
      chunk.map((item) => ({ kind: 0, first: item.path, second: '' })),
      concurrency,
      getSession,
      async (action) => fs.remove(action.first)
    );
  }
}

async function linkPaths(links: Symlink[], getSession: () => MaterializationSession | undefined) {
  // Custom hooks share the original synchronous forEach, including mutations of later entries.
  if (!links.every(ordinaryLink)) {
    links.forEach((link) => link.write());
    return;
  }
  const length = links.length;
  let index = 0;
  while (index < length) {
    const native = getSession();
    if (!native?.usable) {
      for (; index < length; index++) if (index in links) links[index].write();
      return;
    }
    const batch: Action[] = [];
    while (index + batch.length < length && batch.length < 64) {
      const candidate = links[index + batch.length];
      if (!ordinaryLink(candidate)) break;
      batch.push({ kind: candidate.avoidHardLink ? 3 : 2, first: candidate.src, second: candidate.dest });
    }
    if (!batch.length) {
      for (; index < length; index++) if (index in links) links[index].write();
      return;
    }
    const completed = await native.request((id) => actionFrame(id, batch), batch.length);
    if (completed === undefined || completed < batch.length) {
      // Reap before synchronous canonical replay, including its exact public error wrapping.
      await native.dispose();
      index += completed || 0;
      for (; index < length; index++) if (index in links) links[index].write();
      return;
    }
    index += completed;
  }
}

async function perform(
  actions: Action[],
  concurrency: number,
  getSession: () => MaterializationSession | undefined,
  canonical: (action: Action) => Promise<void>
) {
  let offset = 0;
  while (offset < actions.length) {
    const batch = actions.slice(offset, offset + 64);
    const native = getSession();
    const completed = native ? await native.request((id) => actionFrame(id, batch), batch.length) : undefined;
    if (completed === undefined || completed < batch.length) {
      if (native) await native.dispose();
      const prefix = offset + (completed || 0);
      await pMapPool(actions.slice(prefix), canonical, { concurrency });
      return;
    }
    offset += completed;
  }
}

function ordinaryLink(link: Symlink): boolean {
  return (
    link instanceof Symlink &&
    link.write === defaultSymlinkWrite &&
    typeof link.avoidHardLink === 'boolean' &&
    validPath(link.src) &&
    validPath(link.dest) &&
    link.src !== link.dest
  );
}

function validPath(filename: string): boolean {
  return (
    typeof filename === 'string' &&
    path.isAbsolute(filename) &&
    !filename.includes('\0') &&
    Buffer.byteLength(filename) <= 32768 &&
    Buffer.from(filename).toString() === filename
  );
}

function actionFrame(id: number, actions: Action[]): Buffer {
  const header = Buffer.alloc(12);
  header.write('BWP1');
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(actions.length, 8);
  const parts: Buffer[] = [header];
  for (const action of actions) {
    const kind = Buffer.alloc(4);
    kind.writeUInt32BE(action.kind);
    parts.push(kind);
    for (const value of [action.first, action.second]) {
      const bytes = Buffer.from(value);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length);
      parts.push(size, bytes);
    }
  }
  return Buffer.concat(parts);
}
