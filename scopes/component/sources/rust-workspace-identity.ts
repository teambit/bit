import { Ref, Source, canHashSourceNatively } from '@teambit/objects';
import * as eol from '@teambit/toolbox.string.eol';
import type AbstractVinyl from './abstract-vinyl';
import { defaultVinylToSource } from './abstract-vinyl';
export type RustWorkspaceRead = { path: string; contents: Buffer; hash: string; linuxHash: string };
type Snapshot = RustWorkspaceRead;
const snapshots = new WeakMap<AbstractVinyl, Snapshot>();
const defaultLf = eol.lf;

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

/** Keep the ordinary Source API; normalize bytes lazily if a snapshot/tag consumer needs the body. */
export function getRustWorkspaceSource(file: AbstractVinyl): Source | undefined {
  const value = snapshot(file);
  if (!value) return undefined;
  const source = Source.from(Buffer.alloc(0));
  const restore = (contents: Buffer) =>
    Object.defineProperty(source, 'contents', {
      value: contents,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  Object.defineProperty(source, 'contents', {
    configurable: true,
    enumerable: true,
    get() {
      restore(eol.lf(Buffer.from(value.contents)) as Buffer);
      return source.contents;
    },
    set(contents: Buffer) {
      restore(contents);
    },
  });
  const getter = Object.getOwnPropertyDescriptor(source, 'contents')?.get;
  Object.defineProperty(source, 'hash', {
    configurable: true,
    writable: true,
    value() {
      return Object.getOwnPropertyDescriptor(source, 'contents')?.get === getter && canHashSourceNatively()
        ? new Ref(value.linuxHash)
        : Source.prototype.hash.call(source);
    },
  });
  return source;
}
