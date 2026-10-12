import { types } from 'util';
import {
  getRustMergeTransactionToken,
  canUseRustMergeTransactionMode,
  isRustMergeTransactionOperation,
  requestRustMergeTransaction,
  hasRustSnapshotTransactionClassFields,
  snapshotPolicyId,
} from '@teambit/objects';
import type { ComponentID } from '@teambit/component-id';
import type { ComponentMergeStatus } from './merging.main.runtime';

type Witness = { owner: object; prototype: object | null; fields: PropertyDescriptorMap };
const defaultSet = Set;
const defaultSetPrototype = Set.prototype;
const defaultSetHas = Set.prototype.has;
const defaultSetAdd = Set.prototype.add;
function defaultGuardCollections(): boolean {
  return (
    Object.getOwnPropertyDescriptor(globalThis, 'Set')?.value === defaultSet &&
    Object.getOwnPropertyDescriptor(defaultSet, 'prototype')?.value === defaultSetPrototype &&
    Object.getOwnPropertyDescriptor(defaultSetPrototype, 'has')?.value === defaultSetHas &&
    Object.getOwnPropertyDescriptor(defaultSetPrototype, 'add')?.value === defaultSetAdd
  );
}
function capture(owner: unknown): Witness | undefined {
  if (!owner || typeof owner !== 'object' || types.isProxy(owner)) return undefined;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(owner))) return undefined;
  const fields = Object.getOwnPropertyDescriptors(owner);
  if (Reflect.ownKeys(fields).some((key) => !('value' in Reflect.get(fields, key)))) return undefined;
  return { owner, prototype: Object.getPrototypeOf(owner), fields };
}
function fresh(witness: Witness): boolean {
  if (types.isProxy(witness.owner) || Object.getPrototypeOf(witness.owner) !== witness.prototype) return false;
  const current = Object.getOwnPropertyDescriptors(witness.owner);
  const keys = Reflect.ownKeys(witness.fields);
  return (
    Reflect.ownKeys(current).length === keys.length &&
    keys.every((key) => {
      const before = Reflect.get(witness.fields, key) as PropertyDescriptor;
      const after = Reflect.get(current, key) as PropertyDescriptor | undefined;
      return (
        after &&
        'value' in after &&
        before.value === after.value &&
        before.enumerable === after.enumerable &&
        before.configurable === after.configurable &&
        before.writable === after.writable
      );
    })
  );
}
function captureArray(value: unknown): Witness | undefined {
  if (
    !Array.isArray(value) ||
    types.isProxy(value) ||
    value.length > 4096 ||
    !hasRustSnapshotTransactionClassFields(value, 'Array', [])
  )
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(value as object);
  if (Reflect.ownKeys(fields).length !== value.length + 1) return undefined;
  for (let index = 0; index < value.length; index++) {
    if (!fields[index] || !('value' in fields[index])) return undefined;
  }
  return { owner: value, prototype: Object.getPrototypeOf(value), fields };
}
function ordinary(receiver: object): boolean {
  return (
    defaultGuardCollections() &&
    hasRustSnapshotTransactionClassFields(receiver, 'MergeMergingMain', []) &&
    hasRustSnapshotTransactionClassFields([], 'Array', [])
  );
}
export function rustMergeApplyCount(receiver: object, statuses: ComponentMergeStatus[]): number | undefined {
  if (!isRustMergeTransactionOperation() || !ordinary(receiver) || !captureArray(statuses)) return undefined;
  for (let index = 0; index < statuses.length; index++) if (!capture(statuses[index])) return undefined;
  return statuses.length;
}
type RustMergeApplySelection = {
  action: 'oursConflict' | 'unrelatedOurs' | 'load';
  load?: 'remote' | 'current';
  keepLocalVersion: boolean;
  pending: boolean;
  manualPaths: boolean;
  shouldSquash: boolean;
  headUpdate?: 'main' | 'detached';
};
export type RustMergeApplyDecision = RustMergeApplySelection & { isCurrent: () => boolean };
export async function tryRustMergeApplyDecision(
  receiver: object,
  index: number,
  options: {
    currentComponent?: object | null;
    mergeResults?: object | null;
    resolvedUnrelated?: object;
    mergeStrategy?: string | null;
    currentLane?: object;
    detachHead?: boolean;
    shouldSquash?: boolean;
  }
): Promise<RustMergeApplyDecision | undefined> {
  const token = getRustMergeTransactionToken();
  if (!token || !canUseRustMergeTransactionMode('apply') || !ordinary(receiver)) return undefined;
  const merge = options.mergeResults ? capture(options.mergeResults) : undefined;
  const unrelated = options.resolvedUnrelated ? capture(options.resolvedUnrelated) : undefined;
  if ((options.mergeResults && !merge) || (options.resolvedUnrelated && !unrelated)) return undefined;
  const conflicts = merge?.fields.hasConflicts?.value;
  const strategy = unrelated?.fields.strategy?.value;
  if (
    (conflicts !== undefined && typeof conflicts !== 'boolean') ||
    (options.resolvedUnrelated && !['ours', 'theirs'].includes(strategy)) ||
    (options.mergeStrategy != null && !['ours', 'theirs', 'manual'].includes(options.mergeStrategy))
  )
    return undefined;
  const unchanged = () => ordinary(receiver) && (!merge || fresh(merge)) && (!unrelated || fresh(unrelated));
  const decision = await requestRustMergeTransaction<RustMergeApplySelection>(
    {
      kind: 'mergeApplyDecision',
      token,
      index,
      hasCurrent: Boolean(options.currentComponent),
      hasMerge: Boolean(options.mergeResults),
      conflicts: Boolean(conflicts),
      ...(options.mergeStrategy == null ? {} : { strategy: options.mergeStrategy }),
      ...(strategy === undefined ? {} : { resolvedUnrelated: strategy }),
      currentLanePresent: Boolean(options.currentLane),
      detachHead: Boolean(options.detachHead),
      shouldSquash: Boolean(options.shouldSquash),
    },
    (data) =>
      ['oursConflict', 'unrelatedOurs', 'load'].includes(data?.action) &&
      ['keepLocalVersion', 'pending', 'manualPaths', 'shouldSquash'].every((key) => typeof data[key] === 'boolean') &&
      (data.action !== 'load' || ['remote', 'current'].includes(data.load)) &&
      (data.headUpdate === undefined || ['main', 'detached'].includes(data.headUpdate))
  );
  return decision && unchanged() ? { ...decision, isCurrent: unchanged } : undefined;
}

/** Called only after the original lane lookup and isDefault callbacks have completed. */
export async function tryRustMergeLaneBucket(
  receiver: object,
  index: number,
  facts: {
    otherIsMain: boolean;
    currentOnLane: boolean;
    currentHidden: boolean;
  }
): Promise<'skip' | 'hidden' | 'visible' | undefined> {
  const token = getRustMergeTransactionToken();
  if (!token || !canUseRustMergeTransactionMode('apply') || !ordinary(receiver)) return undefined;
  const result = await requestRustMergeTransaction<{ laneBucket: 'skip' | 'hidden' | 'visible' }>(
    { kind: 'mergeLaneBucketDecision', token, index, ...facts },
    (data) => ['skip', 'hidden', 'visible'].includes(data?.laneBucket)
  );
  return result && ordinary(receiver) ? result.laneBucket : undefined;
}

function sameId(left: ReturnType<typeof snapshotPolicyId>, right: ReturnType<typeof snapshotPolicyId>): boolean {
  return Boolean(
    left && right && left.scope === right.scope && left.name === right.name && left.version === right.version
  );
}

type Selection = { failed: number[]; remove: number[]; succeeded: number[]; visible: number[] };
function indices(value: unknown, count: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= count &&
    new Set(value).size === value.length &&
    value.every((index) => Number.isSafeInteger(index) && index >= 0 && index < count)
  );
}
export async function tryRustMergeResultsSelection(
  receiver: object,
  statuses: ComponentMergeStatus[],
  hidden: ComponentID[] = [],
  results: ComponentID[] = []
): Promise<Selection | undefined> {
  const token = getRustMergeTransactionToken();
  if (!token || !canUseRustMergeTransactionMode('apply') || !ordinary(receiver)) return undefined;
  const arrays = [statuses, hidden, results].map(captureArray);
  if (arrays.some((array) => !array) || !statuses.length) return undefined;
  const witnesses = statuses.map(capture);
  if (witnesses.some((row) => !row)) return undefined;
  const rows = witnesses.map((row) => {
    const message = row!.fields.unchangedMessage?.value;
    const removed = row!.fields.shouldBeRemoved?.value;
    return (message === undefined || typeof message === 'string') &&
      (removed === undefined || typeof removed === 'boolean')
      ? { unchanged: Boolean(message), removed: Boolean(removed) }
      : undefined;
  });
  if (rows.some((row) => !row)) return undefined;
  const hiddenIds = hidden.map(snapshotPolicyId);
  const resultIds = results.map(snapshotPolicyId);
  if (hiddenIds.some((id) => !id) || resultIds.some((id) => !id)) return undefined;
  const unchanged = () =>
    ordinary(receiver) &&
    arrays.every((array) => fresh(array!)) &&
    witnesses.every((row) => fresh(row!)) &&
    hidden.every((id, index) => sameId(snapshotPolicyId(id), hiddenIds[index])) &&
    results.every((id, index) => sameId(snapshotPolicyId(id), resultIds[index]));
  const selection = await requestRustMergeTransaction<Selection>(
    {
      kind: 'mergeResultsSelect',
      token,
      index: 0,
      statuses: rows,
      hidden: hiddenIds,
      results: resultIds,
    },
    (data) =>
      indices(data?.failed, rows.length) &&
      indices(data?.remove, rows.length) &&
      indices(data?.succeeded, rows.length) &&
      indices(data?.visible, results.length)
  );
  return selection && unchanged() ? selection : undefined;
}

export function rustMergeResultIds(results: unknown[]): ComponentID[] | undefined {
  if (!captureArray(results)) return undefined;
  const ids: ComponentID[] = [];
  for (let index = 0; index < results.length; index++) {
    const result = capture(results[index]);
    const applied = result && capture(result.fields.applyVersionResult?.value);
    const id = applied?.fields.id?.value;
    if (!applied || !snapshotPolicyId(id)) return undefined;
    ids.push(id);
  }
  return ids;
}
