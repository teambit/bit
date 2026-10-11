import fs from 'fs-extra';
import os from 'os';
import * as path from 'path';
import crypto, { createHash } from 'crypto';
import zlib, { inflateSync } from 'zlib';
import { canReadCacheNatively } from '@teambit/harmony.modules.in-memory-cache';
import { deflate } from '@teambit/legacy.utils';
import {
  getRustSnapshotSourceDescriptor,
  getRustArtifactSourceDescriptor,
  captureRustSnapshotSourceContents,
  captureRustArtifactSourceContents,
} from '@teambit/component.sources';
import type BitObject from './object';
import type Repository from './repository';
import type Version from '../models/version';
import type { CompressedObject, RawObjectsMap } from './object-list';
import type Ref from './ref';
import { hasDefaultSnapshotMethods } from './rust-snapshot';
import {
  hasRustSnapshotFunctions,
  hasRustSnapshotMethods,
  hasRustSnapshotTransactionClass,
  registerRustSnapshotFunctions,
} from './rust-snapshot-guards';
import { canReadLiveObjectsNatively } from './live-objects';
import { prepareRustSnapshotMetadata } from './rust-snapshot-metadata';
import {
  canPrepareRustSnapshotVersion,
  prepareRustSnapshotVersion,
  snapshotCanonicalValue,
} from './rust-snapshot-version';
import {
  isRustSnapshotTransaction,
  requestRustSnapshotTransaction,
  retireRustSnapshotTransaction,
  registerRustSnapshotTransactionCleanup,
} from './rust-snapshot-transaction';

type Raw = CompressedObject & { ref: Ref };
type Manifest = {
  type: string;
  hash: string;
  inflatedSize: number;
  compressedSize: number;
  compressedPath: string;
  compressedSha1: string;
};
type Serialized = { token: string; count: number; objects: Manifest[] };
type Committed = {
  completed: number;
  count: number;
  failed: boolean;
  written: Array<{ hash: string; inflatedSize: number; compressedSize: number }>;
};
export type PreparedSnapshotWrite = { completed: number; fallback: Map<BitObject, () => Promise<Raw>> };
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function denseObjects(objects: BitObject[]): boolean {
  if (!hasRustSnapshotTransactionClass(objects, 'Array') || objects.length < 1 || objects.length > 4096) return false;
  const own = Object.getOwnPropertyDescriptors(objects);
  if (Reflect.ownKeys(own).length !== objects.length + 1) return false;
  for (let index = 0; index < objects.length; index += 1) {
    if (!own[index] || !('value' in own[index])) return false;
  }
  return true;
}

function eligible(repository: Repository, objects: BitObject[]): boolean {
  return (
    isRustSnapshotTransaction() &&
    denseObjects(objects) &&
    Object.values(Object.getOwnPropertyDescriptors(repository)).every((descriptor) => 'value' in descriptor) &&
    hasRustSnapshotFunctions([
      'SnapshotJSON',
      'SnapshotBitObject',
      'SnapshotRepositoryFS',
      'SnapshotRepositoryPath',
      'SnapshotRepositoryLogger',
      'SnapshotPrivateOS',
      'SnapshotPrivateCrypto',
      'SnapshotPrivateZlib',
    ]) &&
    hasRustSnapshotMethods(repository, 'SnapshotRepositoryMethods') &&
    canReadCacheNatively(Object.getOwnPropertyDescriptor(repository, 'cache')?.value) &&
    canReadLiveObjectsNatively(Object.getOwnPropertyDescriptor(repository, 'liveObjects')?.value) &&
    repository.canPersistSnapshotsNatively()
  );
}

function source(object: BitObject, repository: Repository): object | undefined {
  const descriptor = getRustSnapshotSourceDescriptor(object as any) || getRustArtifactSourceDescriptor(object as any);
  if (
    descriptor &&
    hasDefaultSnapshotMethods(object, ['toBuffer', 'serialize', 'compressWithSize', 'getHeader', 'getType', 'id'])
  )
    return { type: 'Source', hash: descriptor.sourceHash, source: descriptor };
  if (!hasRustSnapshotTransactionClass(object, 'Source')) return undefined;
  const reference = object.hash().toString();
  if (!hash(reference)) return undefined;
  // Loaded Sources retain repository ownership. Native rechecks the stored body against the live ref.
  if (
    canReadCacheNatively(Object.getOwnPropertyDescriptor(repository, 'cache')?.value) &&
    canReadLiveObjectsNatively(Object.getOwnPropertyDescriptor(repository, 'liveObjects')?.value) &&
    repository.getCache(object.hash()) === object &&
    fs.existsSync(repository.objectPath(object.hash()))
  )
    return { type: 'Source', hash: reference, repository: { objectsDirectory: repository.getPath(), hash: reference } };
  const contents = Object.getOwnPropertyDescriptor(object, 'contents')?.value;
  if (!Buffer.isBuffer(contents) || contents.length > 2 * 1024 * 1024) return undefined;
  return { type: 'Source', hash: reference, body: contents.toString('hex') };
}

function projection(object: BitObject, repository: Repository): object | undefined {
  if (hasRustSnapshotTransactionClass(object, 'Version'))
    return canPrepareRustSnapshotVersion(object as Version)
      ? { type: 'Version', hash: object.hash().toString() }
      : undefined;
  const metadata = prepareRustSnapshotMetadata(object);
  return metadata ? { ...metadata, hash: object.hash().toString() } : source(object, repository);
}

function manifest(data: any, objects: any[], directory: string): boolean {
  return Boolean(
    data &&
      hash(data.token) &&
      data.count === objects.length &&
      Array.isArray(data.objects) &&
      data.objects.length === objects.length &&
      data.objects.every(
        (item: Manifest, index: number) =>
          item.type === objects[index].type &&
          item.hash === objects[index].hash &&
          Number.isSafeInteger(item.inflatedSize) &&
          item.inflatedSize > 0 &&
          item.inflatedSize <= 33 * 1024 * 1024 &&
          Number.isSafeInteger(item.compressedSize) &&
          item.compressedSize > 0 &&
          item.compressedSize <= 33 * 1024 * 1024 &&
          item.compressedPath === path.join(directory, `${data.token}-${index}.object`) &&
          hash(item.compressedSha1)
      )
  );
}

function commitReply(data: any, objects: Manifest[]): boolean {
  return Boolean(
    data &&
      data.count === objects.length &&
      Number.isSafeInteger(data.completed) &&
      data.completed >= 0 &&
      data.completed <= objects.length &&
      data.failed === (data.completed !== objects.length) &&
      Array.isArray(data.written) &&
      data.written.length === data.completed &&
      data.written.every(
        (item: any, index: number) =>
          item.hash === objects[index].hash &&
          item.inflatedSize === objects[index].inflatedSize &&
          item.compressedSize === objects[index].compressedSize
      )
  );
}

type CapturedValidation = { completed: boolean; validate?: (text: string) => void };

function captureValidation(object: BitObject, type: string): CapturedValidation {
  if (!['Version', 'Component', 'Lane'].includes(type) || !object.validateBeforePersist) return { completed: false };
  const validate = (object as Version).validateBeforePersisting;
  return { completed: false, validate: (text) => validate.call(object, text) };
}

async function canonicalVersion(
  object: BitObject,
  value: () => Record<string, any>,
  headerHash: string,
  validation: CapturedValidation,
  type = 'Version'
): Promise<Raw> {
  const text = JSON.stringify(value());
  if (validation.validate && !validation.completed) {
    validation.validate(text);
    validation.completed = true;
  }
  const body = Buffer.from(text);
  const inflated = Buffer.concat([Buffer.from(`${type} ${headerHash} ${body.toString().length}\0`), body]);
  return { buffer: await deflate(inflated), inflatedSize: inflated.length, ref: object.hash() };
}

function captureSourceFallback(object: BitObject, input: any): (() => Promise<Raw>) | undefined {
  const retained = captureRustSnapshotSourceContents(object as any) || captureRustArtifactSourceContents(object as any);
  const contents = retained ? undefined : Object.getOwnPropertyDescriptor(object, 'contents')?.value;
  if (!retained && !Buffer.isBuffer(contents)) return undefined;
  const copy = retained ? undefined : Buffer.from(contents);
  const headerHash = input.hash;
  return async () => {
    const body = retained ? retained() : copy!;
    const inflated = Buffer.concat([Buffer.from(`Source ${headerHash} ${body.toString().length}\0`), body]);
    return { buffer: await deflate(inflated), inflatedSize: inflated.length, ref: object.hash() };
  };
}

async function readMetadata(item: Manifest, object: BitObject): Promise<{ raw: Raw; body: string }> {
  const buffer = await fs.readFile(item.compressedPath);
  if (buffer.length !== item.compressedSize || createHash('sha1').update(buffer).digest('hex') !== item.compressedSha1)
    throw new Error('invalid snapshot metadata spool');
  const inflated = inflateSync(buffer);
  if (inflated.length !== item.inflatedSize) throw new Error('invalid snapshot metadata size');
  const separator = inflated.indexOf(0);
  const body = inflated.subarray(separator + 1).toString();
  if (separator < 0 || inflated.subarray(0, separator).toString() !== `${item.type} ${item.hash} ${body.length}`)
    throw new Error('invalid snapshot metadata header');
  return { raw: { buffer, inflatedSize: item.inflatedSize, ref: object.hash() }, body };
}

/** Serialize once, validate public metadata classes, then replay only an unacknowledged commit suffix. */
export async function persistPreparedRustSnapshotObjects(
  repository: Repository,
  objects: BitObject[],
  rawObjects: RawObjectsMap | undefined,
  owner: { uid: number; gid: number } | null
): Promise<PreparedSnapshotWrite | undefined> {
  if (!eligible(repository, objects)) return undefined;
  if (objects.some((object) => rawObjects?.has(object))) return undefined;
  const planned = objects.map((object) => projection(object, repository));
  const snapshot = objects.slice();
  if (planned.some((value) => !value)) return undefined;
  const fallback = new Map<BitObject, () => Promise<Raw>>();
  // Canonical Source.serialize copies bytes/header synchronously, before compression's first await.
  // Retained disk provenance supplies an immutable continuation without exposing its public body.
  for (let index = 0; index < objects.length; index += 1) {
    if ((planned[index] as any).type !== 'Source') continue;
    const resume = captureSourceFallback(objects[index], planned[index]);
    if (!resume) return undefined;
    fallback.set(objects[index], resume);
  }
  const versionChecks = new Map<BitObject, () => unknown>();
  const versionValidations = new Map<BitObject, CapturedValidation>();
  const objectsDirectory = repository.getPath();
  const input: any[] = [];
  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index];
    if (hasRustSnapshotTransactionClass(object, 'Version')) {
      const prepared = prepareRustSnapshotVersion(object as Version);
      if (!prepared) return { completed: 0, fallback };
      const headerHash = object.hash().toString();
      const validation = captureValidation(object, 'Version');
      fallback.set(object, () => canonicalVersion(object as Version, prepared.canonicalObject, headerHash, validation));
      versionValidations.set(object, validation);
      versionChecks.set(object, prepared.currentFields);
      input[index] = { ...planned[index], hash: headerHash, fields: prepared.fields };
      if (!prepared.fields) return { completed: 0, fallback };
    } else {
      input[index] = planned[index];
      const type = input[index].type;
      if (type !== 'Source') {
        const value = snapshotCanonicalValue((object as Version).toObject());
        const validation = captureValidation(object, type);
        versionValidations.set(object, validation);
        fallback.set(object, () => canonicalVersion(object, () => value, input[index].hash, validation, type));
      }
    }
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-snapshot-')).catch(() => undefined);
  if (!directory) return { completed: 0, fallback };
  const owned = registerRustSnapshotTransactionCleanup(() => fs.remove(directory));
  try {
    if (
      !eligible(repository, objects) ||
      objects.length !== snapshot.length ||
      objects.some((object, index) => object !== snapshot[index])
    )
      return fallback.size ? { completed: 0, fallback } : undefined;
    const serialized = await requestRustSnapshotTransaction<Serialized>(
      { kind: 'snapshotSerialize', objects: input, stagingDirectory: directory },
      (data) => manifest(data, input, directory)
    );
    if (!serialized) return { completed: 0, fallback };
    const unchanged = () =>
      eligible(repository, objects) &&
      objects.length === snapshot.length &&
      objects.every((object, index) => Object.getOwnPropertyDescriptor(objects, index)?.value === snapshot[index]) &&
      repository.getPath() === objectsDirectory &&
      objects.every(
        (object, index) =>
          JSON.stringify(
            versionChecks.has(object)
              ? { ...planned[index], hash: object.hash().toString(), fields: versionChecks.get(object)!() }
              : projection(object, repository)
          ) === JSON.stringify(input[index])
      );
    // Only metadata crosses this public class-validation boundary; ordinary Source bodies remain native-owned.
    for (let index = 0; index < objects.length; index += 1) {
      if (serialized.objects[index].type === 'Source') continue;
      let metadata: Awaited<ReturnType<typeof readMetadata>>;
      try {
        metadata = await readMetadata(serialized.objects[index], objects[index]);
      } catch {
        await retireRustSnapshotTransaction();
        return { completed: 0, fallback };
      }
      const validation = versionValidations.get(objects[index]);
      if (validation?.validate && !validation.completed) validation.validate(metadata.body);
      if (validation) validation.completed = true;
      fallback.set(objects[index], () => Promise.resolve({ ...metadata.raw, ref: objects[index].hash() }));
    }
    if (!unchanged()) {
      await retireRustSnapshotTransaction();
      return { completed: 0, fallback };
    }
    const committed = await requestRustSnapshotTransaction<Committed>(
      { kind: 'snapshotCommit', token: serialized.token, objectsDirectory, owner },
      (data) => commitReply(data, serialized.objects)
    );
    if (!committed) return { completed: 0, fallback };
    for (let index = 0; index < committed.completed; index += 1) {
      const written = committed.written[index];
      repository.recordNativeObjectWrite(objects[index], written.inflatedSize, written.compressedSize);
    }
    return { completed: committed.completed, fallback };
  } finally {
    if (!owned) await fs.remove(directory).catch(() => {});
  }
}

registerRustSnapshotFunctions('SnapshotPrivateOS', os, ['tmpdir']);
registerRustSnapshotFunctions('SnapshotPrivateCrypto', crypto, ['createHash']);
registerRustSnapshotFunctions('SnapshotPrivateZlib', zlib, ['inflateSync']);
