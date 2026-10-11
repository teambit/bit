/** JavaScript values cross the snapshot boundary before canonical JSON serialization. */
export type RustSnapshotValue =
  | { kind: 'undefined' | 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: string }
  | { kind: 'string'; value: number[] }
  | { kind: 'array'; value: RustSnapshotValue[] }
  | { kind: 'object'; value: [number[], RustSnapshotValue][] };

type Budget = { nodes: number; bytes: number; ancestors: Set<object> };
const MAX_NODES = 65536;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 64;

export function snapshotUtf16(value: string): number[] {
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) result.push(value.charCodeAt(index));
  return result;
}

function numberBits(value: number): string {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(value);
  return bytes.toString('hex');
}

function projectObject(value: object, budget: Budget, depth: number): RustSnapshotValue | undefined {
  if (budget.ancestors.has(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && (array || prototype !== null)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string' || !('value' in descriptors[key])))
    return undefined;
  if (Object.prototype.hasOwnProperty.call(descriptors, 'toJSON')) return undefined;
  if (
    array &&
    [Array.prototype, Object.prototype].some((base) =>
      Reflect.ownKeys(base).some((key) => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key))
    )
  )
    return undefined;
  budget.ancestors.add(value);
  try {
    if (array) {
      const length = descriptors.length.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_NODES) return undefined;
      const entries: RustSnapshotValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const item = project(descriptors[index]?.value, budget, depth + 1);
        if (!item) return undefined;
        entries.push(item);
      }
      return { kind: 'array', value: entries };
    }
    const entries: [number[], RustSnapshotValue][] = [];
    for (const key of Object.keys(descriptors)) {
      if (!descriptors[key].enumerable) continue;
      budget.bytes += key.length * 6;
      if (budget.bytes > MAX_BYTES) return undefined;
      const item = project(descriptors[key].value, budget, depth + 1);
      if (!item) return undefined;
      entries.push([snapshotUtf16(key), item]);
    }
    return { kind: 'object', value: entries };
  } finally {
    budget.ancestors.delete(value);
  }
}

function project(value: unknown, budget: Budget, depth: number): RustSnapshotValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) return undefined;
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return { kind: 'null' };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'number') return { kind: 'number', value: numberBits(value) };
  if (typeof value === 'string') {
    budget.bytes += value.length * 6;
    return budget.bytes <= MAX_BYTES ? { kind: 'string', value: snapshotUtf16(value) } : undefined;
  }
  return typeof value === 'object' ? projectObject(value, budget, depth) : undefined;
}

/** Unsupported classes, accessors, cycles and custom JSON hooks retain canonical execution. */
export function projectRustSnapshotValue(value: unknown): RustSnapshotValue | undefined {
  if (
    Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') ||
    Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  )
    return undefined;
  return project(value, { nodes: 0, bytes: 0, ancestors: new Set() }, 0);
}
