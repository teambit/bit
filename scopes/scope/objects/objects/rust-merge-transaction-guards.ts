import { types } from 'util';
import { hasRustSnapshotTransactionClassFields, registerRustSnapshotTransactionClass } from './rust-snapshot-guards';

type DescriptorSnapshot = { object: object; descriptors: object };
function snapshot(object: object): DescriptorSnapshot | undefined {
  if (types.isProxy(object)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(object);
  if (Reflect.ownKeys(descriptors).some((key) => !('value' in Reflect.get(descriptors, key)))) return undefined;
  return { object, descriptors };
}
function fresh(saved: DescriptorSnapshot): boolean {
  if (types.isProxy(saved.object)) return false;
  const current = Object.getOwnPropertyDescriptors(saved.object);
  const keys = Reflect.ownKeys(saved.descriptors);
  return (
    Reflect.ownKeys(current).length === keys.length &&
    keys.every((key) => {
      const before = Reflect.get(saved.descriptors, key) as PropertyDescriptor;
      const after = Reflect.get(current, key) as PropertyDescriptor | undefined;
      return Boolean(
        after &&
          'value' in after &&
          after.value === before.value &&
          after.writable === before.writable &&
          after.enumerable === before.enumerable &&
          after.configurable === before.configurable
      );
    })
  );
}

export function registerRustMergeStatusProvider(constructor: any): void {
  registerRustSnapshotTransactionClass('MergeStatusProvider', constructor);
}

export function canUseRustMergeStatusProvider(provider: object, ids: unknown): ids is any[] {
  if (
    types.isProxy(provider) ||
    !hasRustSnapshotTransactionClassFields(provider, 'MergeStatusProvider', [
      'scope',
      'logger',
      'importer',
      'options',
      'workspace',
      'currentLane',
      'otherLane',
    ]) ||
    types.isProxy(ids) ||
    !Array.isArray(ids) ||
    ids.length > 4096 ||
    (!hasRustSnapshotTransactionClassFields(ids, 'Array', []) &&
      !hasRustSnapshotTransactionClassFields(ids, 'ComponentIdList', []))
  )
    return false;
  const fields = Object.getOwnPropertyDescriptors(ids);
  if (Reflect.ownKeys(fields).length !== ids.length + 1) return false;
  for (let index = 0; index < ids.length; index++) {
    const id = fields[index]?.value;
    if (!id || types.isProxy(id) || !hasRustSnapshotTransactionClassFields(id, 'ComponentID', [])) return false;
  }
  const options = Object.getOwnPropertyDescriptor(provider, 'options')?.value;
  return Boolean(
    options && !types.isProxy(options) && Object.getPrototypeOf(options) === Object.prototype && snapshot(options)
  );
}

/** Capture only fields used by status policy, before invoking any default ID formatter. */
export function captureRustMergeStatusProvider(provider: object, id: any) {
  if (
    types.isProxy(provider) ||
    types.isProxy(id) ||
    !hasRustSnapshotTransactionClassFields(provider, 'MergeStatusProvider', ['options']) ||
    !hasRustSnapshotTransactionClassFields(id, 'ComponentID', [])
  )
    return undefined;
  const idState = snapshot(id);
  if (!idState) return undefined;
  const nested: DescriptorSnapshot[] = [];
  for (const key of Reflect.ownKeys(idState.descriptors)) {
    const value = Reflect.get(idState.descriptors, key).value;
    if (value && typeof value === 'object') {
      if (types.isProxy(value) || !hasRustSnapshotTransactionClassFields(value, 'BitId', [])) return undefined;
      const state = snapshot(value);
      if (!state) return undefined;
      nested.push(state);
    }
  }
  const options = Object.getOwnPropertyDescriptor(provider, 'options')?.value;
  if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype || !snapshot(options))
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(provider);
  const workspace = Reflect.get(fields, 'workspace')?.value;
  const formatted = id.toString();
  const withoutVersion = id.toStringWithoutVersion();
  if (typeof formatted !== 'string' || typeof withoutVersion !== 'string') return undefined;
  return {
    id: formatted,
    idWithoutVersion: withoutVersion,
    fresh: () =>
      hasRustSnapshotTransactionClassFields(provider, 'MergeStatusProvider', ['options']) &&
      hasRustSnapshotTransactionClassFields(id, 'ComponentID', []) &&
      fresh(idState) &&
      nested.every((state) => hasRustSnapshotTransactionClassFields(state.object, 'BitId', []) && fresh(state)) &&
      Object.getOwnPropertyDescriptor(provider, 'workspace')?.value === workspace &&
      Object.getOwnPropertyDescriptor(provider, 'options')?.value === options &&
      Boolean(snapshot(options)),
  };
}

function denseRefs(value: unknown): string[] | undefined {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    value.length > 4096 ||
    !hasRustSnapshotTransactionClassFields(value, 'Array', [])
  )
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== value.length + 1) return undefined;
  const result: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const ref = fields[index]?.value;
    if (!ref || types.isProxy(ref) || !hasRustSnapshotTransactionClassFields(ref, 'Ref', ['hash'])) return undefined;
    const hash = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash)) return undefined;
    result[index] = hash;
  }
  return result;
}

/** Derive private distance predicates from guarded storage without repeating public methods. */
export function captureRustMergeDivergence(distance: object) {
  if (
    types.isProxy(distance) ||
    !hasRustSnapshotTransactionClassFields(distance, 'MergeSnapsDistance', [
      'snapsOnSourceOnly',
      'snapsOnTargetOnly',
      'commonSnapBeforeDiverge',
      'err',
    ])
  )
    return undefined;
  const fields = Object.getOwnPropertyDescriptors(distance);
  const storage = snapshot(distance);
  const source = denseRefs(fields.snapsOnSourceOnly?.value);
  const target = denseRefs(fields.snapsOnTargetOnly?.value);
  if (!storage || !source || !target) return undefined;
  const commonRef = fields.commonSnapBeforeDiverge?.value;
  if (commonRef && (types.isProxy(commonRef) || !hasRustSnapshotTransactionClassFields(commonRef, 'Ref', ['hash'])))
    return undefined;
  const common = commonRef && Object.getOwnPropertyDescriptor(commonRef, 'hash')?.value;
  if (common && (typeof common !== 'string' || !/^[a-f0-9]{40}$/.test(common))) return undefined;
  const error = fields.err?.value;
  if (error && (types.isProxy(error) || typeof Object.getOwnPropertyDescriptor(error, 'message')?.value !== 'string'))
    return undefined;
  const arrays = [fields.snapsOnSourceOnly.value, fields.snapsOnTargetOnly.value];
  const aliases = arrays.map(snapshot);
  for (const array of arrays) for (let index = 0; index < array.length; index++) aliases.push(snapshot(array[index]));
  if (commonRef) aliases.push(snapshot(commonRef));
  if (aliases.some((alias) => !alias)) return undefined;
  const errorMessage = error && Object.getOwnPropertyDescriptor(error, 'message');
  return {
    sourceAhead: Boolean(source.length),
    targetAhead: Boolean(target.length),
    diverged: Boolean(source.length && target.length),
    ...(common ? { common } : {}),
    error,
    fresh: () =>
      hasRustSnapshotTransactionClassFields(distance, 'MergeSnapsDistance', [
        'snapsOnSourceOnly',
        'snapsOnTargetOnly',
        'commonSnapBeforeDiverge',
        'err',
      ]) &&
      fresh(storage) &&
      aliases.every((alias) => fresh(alias!)) &&
      Boolean(denseRefs(arrays[0])) &&
      Boolean(denseRefs(arrays[1])) &&
      (!error || Object.getOwnPropertyDescriptor(error, 'message')?.value === errorMessage.value),
  };
}
