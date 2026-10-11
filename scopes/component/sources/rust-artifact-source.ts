import crypto, { createHash } from 'crypto';
import * as eol from '@teambit/toolbox.string.eol';
import {
  hasRustSnapshotTransactionClass,
  hasRustSnapshotFunctions,
  registerRustSnapshotFunctions,
} from '@teambit/objects';
import type { Source } from '@teambit/objects';
import type { ArtifactVinyl } from './artifact';

type FileSnapshot = { path: string; contents: Buffer; hash: string };
const files = new WeakMap<ArtifactVinyl, FileSnapshot>();
const sources = new WeakMap<Source, { file: ArtifactVinyl; snapshot: FileSnapshot; contents: Buffer; copy: Buffer }>();
const defaultLf = eol.lf;

/** Default Vinyl cloning is supported only for ordinary buffered build output. */
export function hasRustArtifactVinyl(file: unknown): file is ArtifactVinyl {
  if (
    !hasRustSnapshotTransactionClass(file, 'ArtifactVinyl') ||
    !hasRustSnapshotFunctions(['SnapshotArtifactVinyl', 'SnapshotArtifactObject', 'SnapshotArtifactBuffer'])
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(file as object);
  if (!Buffer.isBuffer(fields._contents?.value) || fields.stat?.value != null) return false;
  const history = fields.history?.value;
  if (!hasRustSnapshotTransactionClass(history, 'Array')) return false;
  const entries = Object.getOwnPropertyDescriptors(history);
  if (Reflect.ownKeys(entries).length !== history.length + 1) return false;
  for (let index = 0; index < history.length; index += 1) {
    if (typeof entries[index]?.value !== 'string') return false;
  }
  return Reflect.ownKeys(fields).every((key) => {
    if (typeof key !== 'string' || !('value' in fields[key])) return false;
    const value = fields[key].value;
    return (
      key === '_contents' ||
      key === 'history' ||
      value == null ||
      ['string', 'boolean', 'number'].includes(typeof value)
    );
  });
}

export function registerRustArtifactFile(file: ArtifactVinyl, path: string, contents: Buffer): void {
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    !hasRustArtifactVinyl(file) ||
    !hasRustSnapshotFunctions(['SnapshotArtifactCrypto'])
  )
    return;
  files.set(file, { path, contents: Buffer.from(contents), hash: createHash('sha1').update(contents).digest('hex') });
}

registerRustSnapshotFunctions('SnapshotArtifactCrypto', crypto, ['createHash']);

function snapshot(file: ArtifactVinyl): FileSnapshot | undefined {
  const value = files.get(file);
  if (!value || process.env.BIT_RUST_CLIENT_VCS !== 'on' || eol.lf !== defaultLf || !hasRustArtifactVinyl(file))
    return undefined;
  return file.contents.equals(value.contents) ? value : undefined;
}

export function inheritRustArtifactFile(original: ArtifactVinyl, clone: ArtifactVinyl): void {
  const value = snapshot(original);
  if (value && hasRustArtifactVinyl(clone) && clone.contents.equals(value.contents)) files.set(clone, value);
}

/** Source creation remains canonical; this only retains its verified capsule disk provenance. */
export function registerRustArtifactSource(file: ArtifactVinyl, source: Source): void {
  const value = snapshot(file);
  if (!value || !hasRustSnapshotTransactionClass(source, 'Source')) return;
  const contents = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
  if (!Buffer.isBuffer(contents)) return;
  sources.set(source, { file, snapshot: value, contents, copy: Buffer.from(contents) });
}

export function getRustArtifactSourceDescriptor(source: Source) {
  const value = sources.get(source);
  if (
    !value ||
    !hasRustSnapshotTransactionClass(source, 'Source') ||
    snapshot(value.file) !== value.snapshot ||
    Object.getOwnPropertyDescriptor(source, 'contents')?.value !== value.contents ||
    !value.contents.equals(value.copy)
  )
    return undefined;
  return {
    path: value.snapshot.path,
    hash: value.snapshot.hash,
    sourceHash: source.hash().toString(),
    normalization: 'linuxEol' as const,
  };
}
