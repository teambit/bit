import { types } from 'util';
import {
  type LaneHistory,
  hasRustSnapshotTransactionClass,
  hasRustSnapshotFunctions,
  registerRustSnapshotFunctions,
  projectRustSnapshotFields,
} from '@teambit/objects';
import { requestRustHistoryReset, isRustHistoryResetOperation } from './rust-history-reset';

registerRustSnapshotFunctions('HistoryResetLaneHistoryObject', Object, [
  'keys',
  'getOwnPropertyDescriptors',
  'getPrototypeOf',
]);
const stringify = JSON.stringify;
const isProxy = types.isProxy;

function ordinaryTree(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (!value || typeof value !== 'object') return typeof value !== 'function';
  if (depth > 64 || isProxy(value) || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return false;
  seen.add(value);
  const fields = Object.getOwnPropertyDescriptors(value);
  const valid = Reflect.ownKeys(fields).every((key) => {
    if (typeof key !== 'string') return false;
    const field = fields[key];
    return 'value' in field && ordinaryTree(field.value, seen, depth + 1);
  });
  seen.delete(value);
  return valid;
}

/** Preserve the live history map and row aliases while Rust selects the ordered deletions. */
export async function removeRustResetLaneHistoryEntries(laneHistory: LaneHistory, keys: string[]): Promise<boolean> {
  if (
    !isRustHistoryResetOperation() ||
    isProxy(laneHistory) ||
    isProxy(keys) ||
    !hasRustSnapshotTransactionClass(laneHistory, 'LaneHistory') ||
    !hasRustSnapshotTransactionClass(keys, 'Array') ||
    !hasRustSnapshotFunctions(['HistoryResetLaneHistoryObject', 'SnapshotJSON']) ||
    Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value !== stringify ||
    keys.length > 4096
  )
    return false;
  const keyFields = Object.getOwnPropertyDescriptors(keys);
  if (Reflect.ownKeys(keyFields).length !== keys.length + 1) return false;
  for (let index = 0; index < keys.length; index += 1) {
    if (!keyFields[index] || !('value' in keyFields[index]) || typeof keyFields[index].value !== 'string') return false;
  }
  const requested = keys.slice();
  const capture = () => {
    if (
      !hasRustSnapshotTransactionClass(laneHistory, 'LaneHistory') ||
      !hasRustSnapshotFunctions(['HistoryResetLaneHistoryObject', 'SnapshotJSON']) ||
      Object.getOwnPropertyDescriptor(JSON, 'stringify')?.value !== stringify
    )
      return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(laneHistory);
    const history = descriptors.history?.value;
    if (!history || typeof history !== 'object' || Array.isArray(history) || !ordinaryTree(history)) return undefined;
    const entries = Object.getOwnPropertyDescriptors(history);
    const names = Object.keys(history);
    if (
      names.length > 4096 ||
      Reflect.ownKeys(entries).length !== names.length ||
      names.some((name) => !entries[name].enumerable || !entries[name].configurable || !('value' in entries[name]))
    )
      return undefined;
    const raw = {
      name: descriptors.name?.value,
      scope: descriptors.scope?.value,
      laneHash: descriptors.laneHash?.value,
      history,
    };
    const fields = projectRustSnapshotFields(raw);
    return fields ? { history, entries, names, fields, serialized: stringify(fields) } : undefined;
  };
  const before = capture();
  if (!before) return false;
  const result = await requestRustHistoryReset<{ remove: number[]; retained: number[] }>(
    { kind: 'historyResetLaneHistory', fields: before.fields, keys: requested },
    (value) => {
      if (!Array.isArray(value?.remove) || !Array.isArray(value.retained)) return false;
      const all = [...value.remove, ...value.retained];
      return (
        all.length === before.names.length &&
        new Set(all).size === all.length &&
        all.every((index) => Number.isSafeInteger(index) && index >= 0 && index < before.names.length) &&
        value.remove.every((index) => requested.includes(before.names[index])) &&
        value.retained.every((index) => !requested.includes(before.names[index]))
      );
    }
  );
  if (!result) return false;
  const currentKeys = Object.getOwnPropertyDescriptors(keys);
  if (
    !hasRustSnapshotTransactionClass(keys, 'Array') ||
    keys.length !== requested.length ||
    Reflect.ownKeys(currentKeys).length !== requested.length + 1 ||
    requested.some((key, index) => currentKeys[index]?.value !== key || !('value' in currentKeys[index]))
  )
    return false;
  const after = capture();
  if (
    !after ||
    after.history !== before.history ||
    after.serialized !== before.serialized ||
    after.names.some(
      (name, index) => name !== before.names[index] || after.entries[name].value !== before.entries[name].value
    )
  )
    return false;
  for (const index of result.remove) delete before.history[before.names[index]];
  return true;
}
