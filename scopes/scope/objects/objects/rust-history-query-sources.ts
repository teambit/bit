import fs from 'fs-extra';
import path from 'path';
import { types } from 'util';
import type Repository from './repository';
import type Source from '../models/source';
import BitObject from './object';
import Ref from './ref';
import { hasRustSnapshotTransactionClassConstructor, hasRustSnapshotTransactionClassFields, hasRustSnapshotFunctions, registerRustSnapshotFunctionReference } from './rust-snapshot-guards';
import { canUseRustHistoryQueryRepository, captureRustHistoryQueryObjects, isRustHistoryQueryOperation } from './rust-history-query';

export type HistorySourceCapsule = { hash: string; privatePath: string; compressedSize: number; inflatedSize: number };
export type HistorySourceReceipt = { sources: HistorySourceCapsule[]; sourceLoads: number[] };
const aliases = new WeakMap<object, { hash: string; contents: Buffer; snapshot: Buffer }>();
const equals = Buffer.prototype.equals;

export function canHydrateRustHistoryQuerySources(): boolean {
  const module = require('../models/source');
  const constructor = Object.getOwnPropertyDescriptor(module, 'default')?.value;
  const registrar = require('@teambit/legacy.scope/dist/object-registrar.js');
  const registered = Object.getOwnPropertyDescriptor(registrar, 'typesObj')?.value;
  return hasRustSnapshotTransactionClassConstructor('Source', constructor) &&
    Object.getOwnPropertyDescriptor(registered || {}, 'Source')?.value === constructor &&
    hasRustSnapshotFunctions(['HistoryQueryObjectParser', 'SnapshotRepositoryFS', 'SnapshotRepositoryPath']);
}

/** Only Sources hydrated from this owned query may keep a repository descriptor after a cache mirror. */
export function hasRustHistoryQuerySourceAlias(repository: Repository, hash: string): boolean {
  if (!canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources()) return false;
  const objects = captureRustHistoryQueryObjects(repository);
  const source = objects?.find(([key]) => key === hash)?.[1];
  if (!source || types.isProxy(source)) return false;
  const alias = aliases.get(source);
  const contents = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
  return Boolean(alias && alias.hash === hash && contents === alias.contents &&
    hasRustSnapshotTransactionClassFields(source, 'Source', ['contents']) &&
    Buffer.isBuffer(contents) && Object.getPrototypeOf(contents) === Buffer.prototype &&
    equals.call(contents, alias.snapshot));
}
registerRustSnapshotFunctionReference('HistoryQuerySourceAlias', hasRustHistoryQuerySourceAlias);

export function validRustHistorySourceReceipt(data: any, directory: string): boolean {
  if (!Array.isArray(data?.sources) || data.sources.length > 4096 || !Array.isArray(data.sourceLoads) || data.sourceLoads.length > 16384)
    return false;
  for (let index = 0; index < data.sources.length; index++) {
    const source = data.sources[index];
    if (!source || typeof source.hash !== 'string' || !/^[a-f0-9]{40}$/.test(source.hash) ||
      typeof source.privatePath !== 'string' || path.dirname(source.privatePath) !== directory ||
      !Number.isSafeInteger(source.compressedSize) || source.compressedSize < 0 || source.compressedSize > 32 * 1024 * 1024 ||
      !Number.isSafeInteger(source.inflatedSize) || source.inflatedSize < 0 || source.inflatedSize > 32 * 1024 * 1024)
      return false;
  }
  for (let index = 0; index < data.sourceLoads.length; index++) {
    const source = data.sourceLoads[index];
    if (!Number.isSafeInteger(source) || source < 0 || source >= data.sources.length) return false;
  }
  return true;
}

/** Read exact private compressed receipts, never re-read a repository file after the owned body decisions. */
export async function hydrateRustHistoryQuerySources(repository: Repository, receipt: HistorySourceReceipt): Promise<boolean> {
  if (!isRustHistoryQueryOperation() || !canUseRustHistoryQueryRepository(repository) || !canHydrateRustHistoryQuerySources()) return false;
  for (let index = 0; index < receipt.sourceLoads.length; index++) {
    if (!isRustHistoryQueryOperation()) return false;
    const descriptor = receipt.sources[receipt.sourceLoads[index]];
    const pending = Object.getOwnPropertyDescriptor(repository.objects, descriptor.hash)?.value;
    const cached = pending || repository.getCache(Ref.from(descriptor.hash));
    if (cached) continue;
    const compressed = await fs.readFile(descriptor.privatePath);
    if (!isRustHistoryQueryOperation()) return false;
    if (compressed.length !== descriptor.compressedSize) throw new Error('history query Source capsule size changed');
    const parsed = await BitObject.parseObjectWithSize(compressed, descriptor.privatePath);
    if (!isRustHistoryQueryOperation() || !canHydrateRustHistoryQuerySources() || !canUseRustHistoryQueryRepository(repository)) return false;
    if (parsed.inflatedSize !== descriptor.inflatedSize || !hasRustSnapshotTransactionClassFields(parsed.object, 'Source', ['contents']))
      throw new Error('history query Source capsule metadata changed');
    const source = parsed.object as Source;
    const contents = Object.getOwnPropertyDescriptor(source, 'contents')?.value;
    if (!Buffer.isBuffer(contents) || source.hash().toString() !== descriptor.hash)
      throw new Error('history query Source capsule identity changed');
    aliases.set(source, { hash: descriptor.hash, contents, snapshot: Buffer.from(contents) });
    repository.hydrateHistoryQueryVersion(source, descriptor.inflatedSize, descriptor.compressedSize);
  }
  return true;
}
