import { Ref, Source, canHashSourceNatively } from '@teambit/objects';
import * as eol from '@teambit/toolbox.string.eol';
import type AbstractVinyl from './abstract-vinyl';
import { defaultVinylToSource } from './abstract-vinyl';
export type RustWorkspaceRead = { path: string; contents: Buffer; hash: string; linuxHash: string };
type Snapshot = RustWorkspaceRead;
const snapshots = new WeakMap<AbstractVinyl, Snapshot>();
const defaultLf = eol.lf;
type SourceSnapshot = {
  file: AbstractVinyl;
  snapshot: Snapshot;
  originalContents: Buffer;
  canonicalContents: Buffer;
  canonicalSnapshot: Buffer;
  getter: () => Buffer;
  setter: (contents: Buffer) => void;
  hash: () => Ref;
};
const sourceSnapshots = new WeakMap<Source, SourceSnapshot>();

export function hasOrdinaryWorkspaceProperties(file: AbstractVinyl): boolean {
  if (['relative', 'path', 'toSourceAsLinuxEOL'].some((name) => Object.getOwnPropertyDescriptor(file, name)?.get))
    return false;
  for (let prototype = Object.getPrototypeOf(file); prototype; prototype = Object.getPrototypeOf(prototype)) {
    if (
      ['contents', 'relative', 'path', 'toSourceAsLinuxEOL'].some(
        (name) => Object.getOwnPropertyDescriptor(prototype, name)?.get
      )
    )
      return false;
    if (Object.hasOwn(prototype, 'toSourceAsLinuxEOL')) break;
  }
  return file.toSourceAsLinuxEOL === defaultVinylToSource;
}

export function registerRustWorkspaceFile(file: AbstractVinyl, read: RustWorkspaceRead): void {
  if (file.path !== read.path || !Buffer.isBuffer(file.contents) || !file.contents.equals(read.contents)) return;
  // The retained copy detects mutation of the original Buffer without hashing it again in Node.
  snapshots.set(file, { ...read, contents: Buffer.from(read.contents) });
}

function snapshot(file: AbstractVinyl): Snapshot | undefined {
  const value = snapshots.get(file);
  if (
    !value ||
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    !hasOrdinaryWorkspaceProperties(file) ||
    eol.lf !== defaultLf ||
    Object.getOwnPropertyDescriptor(file, 'contents')?.get ||
    Object.getOwnPropertyDescriptor(file, 'path')?.get ||
    file.path !== value.path ||
    !Buffer.isBuffer(file.contents) ||
    !file.contents.equals(value.contents) ||
    !canHashSourceNatively()
  )
    return undefined;
  return value;
}

export function getRustWorkspaceFileDescriptor(file: AbstractVinyl): { path: string; hash: string } | undefined {
  const value = snapshot(file);
  return value && { path: value.path, hash: value.hash };
}

/** Retain disk provenance across read-only hydration, while rejecting any byte or method mutation. */
export function getRustSnapshotSourceDescriptor(
  source: Source
): { path: string; hash: string; sourceHash: string } | undefined {
  const value = sourceSnapshots.get(source);
  const contents = Object.getOwnPropertyDescriptor(source, 'contents');
  const hash = Object.getOwnPropertyDescriptor(source, 'hash');
  if (
    !value ||
    Object.getPrototypeOf(source) !== Source.prototype ||
    !(
      (contents?.get === value.getter && contents?.set === value.setter && hash?.value === value.hash) ||
      (contents &&
        !contents.get &&
        !contents.set &&
        contents.value === value.canonicalContents &&
        value.canonicalContents.equals(value.canonicalSnapshot) &&
        source.hash === Source.prototype.hash)
    ) ||
    source.id !== Source.prototype.id ||
    snapshot(value.file) !== value.snapshot ||
    value.file.contents !== value.originalContents
  )
    return undefined;
  return { path: value.snapshot.path, hash: value.snapshot.hash, sourceHash: value.snapshot.linuxHash };
}

/** Keep canonical Buffer aliasing while deferring exposure of the Source body. */
export function getRustWorkspaceSource(file: AbstractVinyl): Source | undefined {
  const value = snapshot(file);
  if (!value) return undefined;
  const originalContents = file.contents;
  // Canonical eol.lf aliases unchanged/binary bytes, but captures a separate copy when normalizing.
  // Retaining its actual result preserves both behaviors if the workspace Buffer later mutates.
  const canonicalContents = eol.lf(originalContents) as Buffer;
  const source = Source.from(Buffer.alloc(0));
  const hash = () => {
    const descriptor = getRustSnapshotSourceDescriptor(source);
    return descriptor ? new Ref(descriptor.sourceHash) : Source.prototype.hash.call(source);
  };
  const restore = (contents: Buffer) => {
    if (Object.getOwnPropertyDescriptor(source, 'hash')?.value === hash) Reflect.deleteProperty(source, 'hash');
    Object.defineProperty(source, 'contents', {
      value: contents,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  };
  const getter = () => {
    restore(canonicalContents);
    return source.contents;
  };
  const setter = (contents: Buffer) => {
    sourceSnapshots.delete(source);
    restore(contents);
  };
  Object.defineProperty(source, 'contents', {
    configurable: true,
    enumerable: true,
    get: getter,
    set: setter,
  });
  Object.defineProperty(source, 'hash', {
    configurable: true,
    writable: true,
    value: hash,
  });
  sourceSnapshots.set(source, {
    file,
    snapshot: value,
    originalContents,
    canonicalContents,
    canonicalSnapshot: Buffer.from(canonicalContents),
    getter,
    setter,
    hash,
  });
  return source;
}
