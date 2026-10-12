import { types } from 'util';
import type { ComponentID } from '@teambit/component-id';
import {
  canUseRustMergeTransactionMode,
  getRustMergeTransactionToken,
  hasRustSnapshotTransactionClassFields,
  requestRustMergeTransaction,
  snapshotPolicyId,
  Ref,
} from '@teambit/objects';

type Identity = NonNullable<ReturnType<typeof snapshotPolicyId>>;
function captureIds(ids: ComponentID[]): { rows: Identity[]; valid: () => boolean } | undefined {
  if (
    !Array.isArray(ids) ||
    types.isProxy(ids) ||
    ids.length > 4096 ||
    (!hasRustSnapshotTransactionClassFields(ids, 'Array', []) &&
      !hasRustSnapshotTransactionClassFields(ids, 'ComponentIdList', []))
  )
    return undefined;
  const prototype = Object.getPrototypeOf(ids);
  const className = hasRustSnapshotTransactionClassFields(ids, 'Array', []) ? 'Array' : 'ComponentIdList';
  const descriptors = Object.getOwnPropertyDescriptors(ids as object);
  if (Reflect.ownKeys(descriptors).length !== ids.length + 1) return undefined;
  const rows: Identity[] = [];
  for (let index = 0; index < ids.length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor || !('value' in descriptor)) return undefined;
    const row = snapshotPolicyId(descriptor.value);
    if (!row) return undefined;
    rows.push(row);
  }
  return {
    rows,
    valid: () => {
      if (
        types.isProxy(ids) ||
        Object.getPrototypeOf(ids) !== prototype ||
        !hasRustSnapshotTransactionClassFields(ids, className, [])
      )
        return false;
      const current = Object.getOwnPropertyDescriptors(ids as object);
      if (
        Reflect.ownKeys(current).length !== Reflect.ownKeys(descriptors).length ||
        current.length.value !== rows.length
      )
        return false;
      for (let index = 0; index < rows.length; index++) {
        const descriptor = current[index];
        if (!descriptor || !('value' in descriptor) || descriptor.value !== descriptors[index].value) return false;
        const now = snapshotPolicyId(descriptor.value);
        if (
          !now ||
          now.scope !== rows[index].scope ||
          now.name !== rows[index].name ||
          now.version !== rows[index].version
        )
          return false;
      }
      return true;
    },
  };
}
function eligible(receiver: object): boolean {
  return (
    collectionsAvailable() &&
    canUseRustMergeTransactionMode('lane') &&
    hasRustSnapshotTransactionClassFields(receiver, 'MergeLanesMain', [])
  );
}
function selected(value: unknown, count: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= count &&
    new Set(value).size === value.length &&
    value.every((index) => Number.isSafeInteger(index) && index >= 0 && index < count)
  );
}

/** Filter only after the canonical flattened-dependency callback has returned. */
export async function tryRustMergePatternDependencies(
  receiver: object,
  excluded: ComponentID[],
  dependencies: ComponentID[]
): Promise<number[] | undefined> {
  if (!eligible(receiver)) return undefined;
  const left = captureIds(excluded);
  const right = captureIds(dependencies);
  const token = getRustMergeTransactionToken();
  if (!left || !right || !token) return undefined;
  const result = await requestRustMergeTransaction<{ selected: number[] }>(
    {
      kind: 'mergePatternDependencies',
      token,
      index: 0,
      excluded: left.rows,
      dependencies: right.rows,
    },
    (data) => selected(data?.selected, right.rows.length)
  );
  return result && eligible(receiver) && left.valid() && right.valid() ? result.selected : undefined;
}

const defaultSet = Set;
const defaultSetPrototype = Set.prototype;
const defaultSetHas = Set.prototype.has;
const defaultSetAdd = Set.prototype.add;
const defaultSetValues = Set.prototype.values;
function collectionsAvailable(): boolean {
  return (
    Object.getOwnPropertyDescriptor(globalThis, 'Set')?.value === defaultSet &&
    Object.getOwnPropertyDescriptor(defaultSet, 'prototype')?.value === defaultSetPrototype &&
    Object.getOwnPropertyDescriptor(defaultSetPrototype, 'has')?.value === defaultSetHas &&
    Object.getOwnPropertyDescriptor(defaultSetPrototype, 'add')?.value === defaultSetAdd &&
    Object.getOwnPropertyDescriptor(defaultSetPrototype, 'values')?.value === defaultSetValues &&
    hasRustSnapshotTransactionClassFields([], 'Array', [])
  );
}
function captureHashes(hashes: string[]): { rows: string[]; valid: () => boolean } | undefined {
  if (
    !collectionsAvailable() ||
    types.isProxy(hashes) ||
    !Array.isArray(hashes) ||
    hashes.length > 4096 ||
    Object.getPrototypeOf(hashes) !== Array.prototype
  )
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(hashes as object);
  if (Reflect.ownKeys(fields).length !== hashes.length + 1) return undefined;
  const rows: string[] = [];
  for (let index = 0; index < hashes.length; index++) {
    const row = fields[index];
    if (!row || !('value' in row) || typeof row.value !== 'string' || !/^[a-f0-9]{40}$/.test(row.value))
      return undefined;
    rows.push(row.value);
  }
  return {
    rows,
    valid: () =>
      collectionsAvailable() &&
      !types.isProxy(hashes) &&
      Object.getPrototypeOf(hashes) === Array.prototype &&
      hashes.length === rows.length &&
      Reflect.ownKeys(hashes).length === rows.length + 1 &&
      rows.every((row, index) => Object.getOwnPropertyDescriptor(hashes, index)?.value === row),
  };
}

/** Consume the original existence-check results without repeating any repository callbacks. */
export async function tryRustMergeDependencyMissing(
  receiver: object,
  candidates: string[],
  existing: string[]
): Promise<number[] | undefined> {
  if (!collectionsAvailable() || !eligible(receiver)) return undefined;
  const left = captureHashes(candidates);
  const right = captureHashes(existing);
  const token = getRustMergeTransactionToken();
  if (!left || !right || !token) return undefined;
  const result = await requestRustMergeTransaction<{ missing: number[] }>(
    {
      kind: 'mergeDependencyMissing',
      token,
      index: 0,
      candidates: left.rows,
      existing: right.rows,
    },
    (data) => selected(data?.missing, left.rows.length)
  );
  return result && collectionsAvailable() && left.valid() && right.valid() && eligible(receiver)
    ? result.missing
    : undefined;
}

/** Preserve the public head/version/dependency reads; Rust selects retained snap references. */
export async function tryRustMergeDependencyCandidates(
  receiver: object,
  owner: ComponentID,
  checked: string[],
  dependencies: ComponentID[]
): Promise<{ selected: number[]; checked: string[] } | undefined> {
  if (
    !collectionsAvailable() ||
    !eligible(receiver) ||
    !hasRustSnapshotTransactionClassFields(Object.create(Ref.prototype), 'Ref', ['hash'])
  )
    return undefined;
  const ownerIds = captureIds([owner]);
  const previous = captureHashes(checked);
  const deps = captureIds(dependencies);
  const token = getRustMergeTransactionToken();
  if (
    !ownerIds ||
    !previous ||
    !deps ||
    !token ||
    deps.rows.some((row) => row.version && /^[a-fA-F0-9]{40}$/.test(row.version) && !/^[a-f0-9]{40}$/.test(row.version))
  )
    return undefined;
  const result = await requestRustMergeTransaction<{ selected: number[]; checked: string[] }>(
    {
      kind: 'mergeDependencyCandidates',
      token,
      index: 0,
      owner: ownerIds.rows[0],
      checked: previous.rows,
      dependencies: deps.rows,
    },
    (data) =>
      selected(data?.selected, deps.rows.length) &&
      Array.isArray(data?.checked) &&
      data.checked.length === data.selected.length &&
      data.checked.every(
        (hash, index) =>
          typeof hash === 'string' && /^[a-f0-9]{40}$/.test(hash) && hash === deps.rows[data.selected[index]].version
      )
  );
  return result && collectionsAvailable() && previous.valid() && ownerIds.valid() && deps.valid() && eligible(receiver)
    ? result
    : undefined;
}

export async function tryRustMergePatternOutcome(
  receiver: object,
  facts: {
    includeDeps: boolean;
    hasDependencies: boolean;
    headMatches?: boolean;
  }
): Promise<'none' | 'add' | 'head' | 'history' | undefined> {
  if (!eligible(receiver)) return undefined;
  const token = getRustMergeTransactionToken();
  if (!token) return undefined;
  const result = await requestRustMergeTransaction<{ action: 'none' | 'add' | 'head' | 'history' }>(
    {
      kind: 'mergePatternOutcome',
      token,
      index: 0,
      ...facts,
    },
    (data) => ['none', 'add', 'head', 'history'].includes(data?.action)
  );
  return result && eligible(receiver) ? result.action : undefined;
}
