import { types } from 'util';
import path from 'path';
import { BitError } from '@teambit/bit-error';
import type { SourceFile } from '@teambit/component.sources';
import {
  type captureNativeMergeTarget,
  hasRustMergeRetainedBodyFunctions,
  getRustMergeResultBodyPlan,
  assembleRustMergeResultBodies,
  FileStatus,
  type RustMergeBodyPlan,
  type RustMergeBody,
  type MergeResultsThreeWay,
  type MergeStrategy,
} from '@teambit/component.modules.merge-helper';
import {
  requestRustMergeTransaction,
  isRustMergeTransactionOperation,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotTransactionClassFieldsBatch,
  hasRustSnapshotFunctions,
} from '@teambit/objects';

type Target = NonNullable<ReturnType<typeof captureNativeMergeTarget>>;
type Applied = {
  files: Array<{
    kind: 'target' | 'current' | 'other';
    index: number;
    planIndex: number;
    relativePath: string;
    finalIndex: number;
    aliasKind: 'target' | 'current' | 'other' | 'new';
    aliasIndex: number;
  }>;
  bodies: RustMergeBody[];
  knownBodies: number;
  bodyCount: number;
  filesStatus: Array<{ relativePath: string; status: keyof typeof FileStatus }>;
  deferredError?: { phase: 'applyModified'; message: string };
};
// Keep complete wire and alias validation together before any public file mutation.
// eslint-disable-next-line complexity
function validApplied(data: any, clones: SourceFile[], plan: RustMergeBodyPlan, target: Target): data is Applied {
  if (
    !data ||
    !Array.isArray(data.files) ||
    data.files.length > 8192 ||
    !Array.isArray(data.bodies) ||
    data.bodies.length > 4096 ||
    data.knownBodies !== plan.bodies.length ||
    data.bodyCount !== plan.bodies.length + data.bodies.length ||
    data.bodyCount > 4096 ||
    !Array.isArray(data.filesStatus) ||
    data.filesStatus.length > 8192
  )
    return false;
  const directory = plan.snapshotDirectory;
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return false;
  const bodies = new Set(plan.bodies.map((body) => body.planIndex));
  for (const [index, body] of data.bodies.entries()) {
    if (
      !body ||
      body.planIndex !== plan.bodies.length + index ||
      !Number.isSafeInteger(body.planIndex) ||
      body.planIndex < 0 ||
      body.planIndex >= 4096 ||
      bodies.has(body.planIndex) ||
      typeof body.spoolPath !== 'string' ||
      typeof body.spoolHash !== 'string' ||
      !/^[a-f0-9]{40}$/.test(body.spoolHash) ||
      !Number.isSafeInteger(body.bytes) ||
      body.bytes < 0 ||
      body.bytes > 32 * 1024 * 1024 ||
      (body.spoolOffset !== undefined &&
        (!Number.isSafeInteger(body.spoolOffset) ||
          body.spoolOffset < 0 ||
          body.spoolOffset + body.bytes > 32 * 1024 * 1024))
    )
      return false;
    if (body.spoolOffset === undefined) {
      if (body.spoolPath !== path.join(directory, `${plan.token}-${body.planIndex}.checkout`)) return false;
    } else {
      const name = path.basename(body.spoolPath);
      const match = new RegExp(`^${plan.token}-(0|[1-9][0-9]*)[.]checkout-pack$`).exec(name);
      if (path.dirname(body.spoolPath) !== directory || !match || Number(match[1]) > body.planIndex) return false;
    }
    bodies.add(body.planIndex);
  }
  const paths = new Set([
    ...target.manifest.files.map((file) => file.relativePath),
    ...plan.currentRows.map((file) => file.relativePath),
    ...plan.targetManifest.files.map((file) => file.relativePath),
  ]);
  for (let index = 0; index < data.files.length; index++) {
    const row = data.files[index];
    if (
      !row ||
      row.finalIndex !== index ||
      !['target', 'current', 'other'].includes(row.kind) ||
      !['target', 'current', 'other', 'new'].includes(row.aliasKind) ||
      !Number.isSafeInteger(row.aliasIndex) ||
      row.aliasIndex < 0 ||
      (row.aliasKind === 'target' && row.aliasIndex >= clones.length) ||
      (row.aliasKind === 'current' && row.aliasIndex >= plan.currentClones.length) ||
      (row.aliasKind === 'other' && row.aliasIndex >= plan.targetManifest.files.length) ||
      !Number.isSafeInteger(row.index) ||
      row.index < 0 ||
      !Number.isSafeInteger(row.planIndex) ||
      !bodies.has(row.planIndex) ||
      !paths.has(row.relativePath)
    )
      return false;
    const original =
      row.kind === 'target'
        ? target.manifest.files[row.index]
        : row.kind === 'current'
          ? plan.currentRows[row.index]
          : plan.targetManifest.files[row.index];
    if (
      !original ||
      original.relativePath !== row.relativePath ||
      (row.kind === 'target' && row.index >= clones.length)
    )
      return false;
  }
  return (
    data.filesStatus.every((row) => row && paths.has(row.relativePath) && Object.hasOwn(FileStatus, row.status)) &&
    (data.deferredError === undefined ||
      (data.deferredError?.phase === 'applyModified' && typeof data.deferredError.message === 'string'))
  );
}

/** This runs after the original public clone prefix, never after canonical apply mutations. */
export async function applyRetainedRustMerge(
  clones: SourceFile[],
  results: MergeResultsThreeWay,
  plan: RustMergeBodyPlan,
  target: Target,
  strategy: MergeStrategy | null | undefined
) {
  const valid = (checkPlan = true) =>
    isRustMergeTransactionOperation() &&
    hasRustSnapshotFunctions(['MergeRetainedPublicGuard']) &&
    hasRustMergeRetainedBodyFunctions() &&
    (!checkPlan || getRustMergeResultBodyPlan(results) === plan) &&
    target.fresh() &&
    !types.isProxy(clones) &&
    hasRustSnapshotTransactionClassFields(clones, 'Array', []) &&
    hasRustSnapshotTransactionClassFieldsBatch(clones, 'SourceFile', [
      'history',
      '_base',
      '_cwd',
      'base',
      'path',
      'relative',
    ]);
  if (!valid()) return undefined;
  const applied = await requestRustMergeTransaction<Applied>(
    {
      kind: 'mergeApply',
      token: plan.ownerToken,
      planToken: plan.token,
      knownBodies: plan.bodies.length,
      target: target.manifest,
      strategy,
    },
    (data) => validApplied(data, clones, plan, target)
  );
  if (!applied || !valid(false)) return undefined;
  // The assembler rechecks the retained plan before observing public rows, then attaches synchronously.
  const files = assembleRustMergeResultBodies(results, plan, clones, applied.files, applied.bodies);
  if (!files) return undefined;
  if (applied.deferredError) throw new BitError(applied.deferredError.message);
  const filesStatus: Record<string, string> = {};
  for (const row of applied.filesStatus) filesStatus[row.relativePath] = FileStatus[row.status];
  return { modifiedFiles: files, filesStatus };
}
