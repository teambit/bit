import type Version from '../models/version';
import type Repository from './repository';
import Ref from './ref';
import { hasRustSnapshotFunctionReference, hasRustSnapshotTransactionClassConstructor } from './rust-snapshot-guards';
import { canUseRustHistoryQueryRepository, type HistoryQueryCapture } from './rust-history-query';

export type HistoryHydrationRow = {
  hash: string;
  overlayIndex?: number;
  versionJSON?: string;
  inflatedSize?: number;
  compressedSize?: number;
};

function parser(): ((contents: string, hash: string) => Version) | undefined {
  const module = require('../models/version');
  const constructor = Object.getOwnPropertyDescriptor(module, 'default')?.value;
  const guard = Object.getOwnPropertyDescriptor(module, 'canHydrateHistoryVersionsNatively')?.value;
  if (!hasRustSnapshotFunctionReference('HistoryQueryVersionHydration', guard) ||
    !hasRustSnapshotTransactionClassConstructor('Version', constructor) || !guard()) return undefined;
  return Object.getOwnPropertyDescriptor(constructor, 'parse')?.value;
}

export function canHydrateRustHistoryQueryVersions(): boolean {
  return typeof parser() === 'function';
}

/** Validate the whole metadata receipt before touching public cache state. */
export function prepareRustHistoryQueryHydration(
  repository: Repository,
  capture: HistoryQueryCapture,
  rows: HistoryHydrationRow[],
  skip?: { hash: string; version: Version }
): { apply: () => Array<Version | undefined> | undefined } | undefined {
  const parse = parser();
  if (!parse || !canUseRustHistoryQueryRepository(repository) || !capture.fresh()) return undefined;
  if (rows.length > 4096) return undefined;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!/^[a-f0-9]{40}$/.test(row.hash)) return undefined;
    const cached = capture.objects.find(([key]) => key === row.hash)?.[1];
    if (cached && !capture.versions.includes(cached as Version)) return undefined;
    if (row.overlayIndex !== undefined && (
      !Number.isSafeInteger(row.overlayIndex) || row.overlayIndex < 0 || row.overlayIndex >= capture.versions.length ||
      capture.overlays[row.overlayIndex].hash !== row.hash
    )) return undefined;
    if (row.versionJSON !== undefined && (
      typeof row.versionJSON !== 'string' || Buffer.byteLength(row.versionJSON) > 4 * 1024 * 1024 ||
      !Number.isSafeInteger(row.inflatedSize) || row.inflatedSize! < 0 || row.inflatedSize! > 32 * 1024 * 1024 ||
      !Number.isSafeInteger(row.compressedSize) || row.compressedSize! < 0 || row.compressedSize! > 32 * 1024 * 1024
    )) return undefined;
  }
  return {
    apply: () => {
      if (parser() !== parse || !canUseRustHistoryQueryRepository(repository) || !capture.fresh()) return undefined;
      const versions: Array<Version | undefined> = [];
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (skip && row.hash === skip.hash) {
          versions[index] = skip.version;
          continue;
        }
        const pending = Object.getOwnPropertyDescriptor(repository.objects, row.hash)?.value;
        const cached = pending || repository.getCache(Ref.from(row.hash));
        if (cached) {
          versions[index] = cached as Version;
        } else if (row.versionJSON !== undefined) {
          const version = parse(row.versionJSON, row.hash);
          repository.hydrateHistoryQueryVersion(version, row.inflatedSize!, row.compressedSize!);
          versions[index] = version;
        }
      }
      return versions;
    },
  };
}
