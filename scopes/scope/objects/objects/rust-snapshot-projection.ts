import { hasRustSnapshotTransactionClass } from './rust-snapshot-guards';
import { hasRustArtifactVinyl } from '@teambit/component.sources';
import { projectRustCompactSnapshotValue, type RustCompactSnapshotValue } from './rust-snapshot-values';

const invalid = Symbol('unsupported snapshot metadata');
const recordClasses = ['Dependency', 'ExtensionDataEntry', 'DetachedHeads'];

function artifactFields(value: object, descriptors: PropertyDescriptorMap, seen: Set<object>, depth: number) {
  // Generated vinyls have separate callback ownership; stored artifact references are pure metadata.
  const vinyls = descriptors.vinyls?.value;
  if (!hasRustSnapshotTransactionClass(vinyls, 'Array')) return invalid;
  const vinylEntries = Object.getOwnPropertyDescriptors(vinyls);
  if (Reflect.ownKeys(vinylEntries).length !== vinyls.length + 1) return invalid;
  for (let index = 0; index < vinyls.length; index += 1) {
    if (!hasRustArtifactVinyl(vinylEntries[index]?.value)) return invalid;
  }
  const storedRefs = descriptors.refs?.value;
  if (!hasRustSnapshotTransactionClass(storedRefs, 'Array')) return invalid;
  const refEntries = Object.getOwnPropertyDescriptors(storedRefs);
  if (Reflect.ownKeys(refEntries).length !== storedRefs.length + 1) return invalid;
  for (let index = 0; index < storedRefs.length; index += 1) {
    const entry = refEntries[index]?.value;
    if (!entry || typeof entry !== 'object') return invalid;
    const reference = Object.getOwnPropertyDescriptor(entry, 'ref');
    if (!reference || !('value' in reference) || !hasRustSnapshotTransactionClass(reference.value, 'Ref'))
      return invalid;
  }
  seen.add(value);
  const paths = plain(descriptors.paths?.value, seen, depth + 1);
  const refs = plain(descriptors.refs?.value, seen, depth + 1);
  seen.delete(value);
  return paths === invalid || refs === invalid ? invalid : { snapshotArtifactFiles: true, refs };
}

/** Snapshot ordinary class data without executing an unknown getter, serializer or iterator. */
function plain(value: unknown, seen: Set<object>, depth: number): unknown | typeof invalid {
  if (!value || typeof value !== 'object') return typeof value === 'function' ? invalid : value;
  if (depth > 64 || seen.has(value)) return invalid;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || !('value' in descriptors[key])) return invalid;
  }
  if (hasRustSnapshotTransactionClass(value, 'Ref')) return descriptors.hash?.value;
  if (hasRustSnapshotTransactionClass(value, 'ComponentID')) {
    if (!hasRustSnapshotTransactionClass(descriptors._legacy?.value, 'BitId')) return invalid;
    // The ID's public serialization is the canonical primitive projection boundary.
    return (value as any).toObject();
  }
  if (hasRustSnapshotTransactionClass(value, 'LaneId')) return (value as any).toObject();
  if (hasRustSnapshotTransactionClass(value, 'ArtifactFiles')) {
    return artifactFields(value, descriptors, seen, depth);
  }
  // Only the registered ArtifactFiles conversion above can introduce this private wire marker.
  if (Object.getOwnPropertyDescriptor(descriptors, 'snapshotArtifactFiles')) return invalid;
  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (isArray) {
    if (
      !hasRustSnapshotTransactionClass(value, 'Array') &&
      !hasRustSnapshotTransactionClass(value, 'ComponentIdList') &&
      !hasRustSnapshotTransactionClass(value, 'ExtensionDataList')
    )
      return invalid;
  } else if (prototype !== Object.prototype && prototype !== null) {
    let supported = false;
    for (let index = 0; index < recordClasses.length; index += 1) {
      if (hasRustSnapshotTransactionClass(value, recordClasses[index])) supported = true;
    }
    if (!supported) return invalid;
  }
  seen.add(value);
  const result: any = isArray ? [] : Object.create(null);
  if (isArray) {
    const length = descriptors.length.value;
    if (!Number.isSafeInteger(length) || length > 65536 || keys.length !== length + 1) return invalid;
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor) return invalid;
      const item = plain(descriptor.value, seen, depth + 1);
      if (item === invalid) return invalid;
      result[index] = item;
    }
  } else {
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] as string;
      if (!descriptors[key].enumerable) continue;
      const item = plain(descriptors[key].value, seen, depth + 1);
      if (item === invalid) return invalid;
      result[key] = item;
    }
  }
  seen.delete(value);
  return result;
}

/** Raw metadata is encoded as JavaScript values; Rust owns model transforms and JSON bytes. */
export function projectRustSnapshotFields(value: unknown): RustCompactSnapshotValue | undefined {
  const projected = plain(value, new Set(), 0);
  return projected === invalid ? undefined : projectRustCompactSnapshotValue(projected);
}
