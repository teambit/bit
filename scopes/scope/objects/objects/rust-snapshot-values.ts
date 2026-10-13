/** JavaScript values cross the snapshot boundary before canonical JSON serialization. */
export type RustSnapshotValue =
  | { kind: 'undefined' | 'null' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: string }
  | { kind: 'string'; value: string | number[] }
  | { kind: 'array'; value: RustSnapshotValue[] }
  | { kind: 'object'; value: [string | number[], RustSnapshotValue][] };

/** Primitive leaves and arrays need no per-value envelope; exceptional values retain tagged encoding. */
export type RustCompactSnapshotValue =
  | RustSnapshotValue
  | string
  | boolean
  | null
  | RustCompactSnapshotValue[]
  | { kind: 'object'; value: [string | number[], RustCompactSnapshotValue][] }
  | { kind: 'array'; value: RustCompactSnapshotValue[] };

type Budget = { nodes: number; bytes: number; ancestors: Set<object>; compact: boolean };
const MAX_NODES = 65536;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 64;
const wellFormed: ((this: string) => boolean) | undefined = Object.getOwnPropertyDescriptor(
  String.prototype,
  'isWellFormed'
)?.value;
const charCode = String.prototype.charCodeAt;

export function snapshotUtf16(value: string): number[] {
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) result.push(charCode.call(value, index));
  return result;
}

/** UTF-8 JSON strings avoid a numeric array per character; lone surrogates remain exact UTF-16 units. */
function wireText(value: string): string | number[] {
  return wellFormed?.call(value) ? value : snapshotUtf16(value);
}

function numberBits(value: number): string {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(value);
  return bytes.toString('hex');
}

function projectObject(value: object, budget: Budget, depth: number): RustCompactSnapshotValue | undefined {
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
      const entries: RustCompactSnapshotValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const item = project(descriptors[index]?.value, budget, depth + 1);
        if (item === undefined) return undefined;
        entries.push(item);
      }
      return budget.compact ? entries : { kind: 'array', value: entries };
    }
    const entries: [string | number[], RustCompactSnapshotValue][] = [];
    for (const key of Object.keys(descriptors)) {
      if (!descriptors[key].enumerable) continue;
      budget.bytes += key.length * 6;
      if (budget.bytes > MAX_BYTES) return undefined;
      const item = project(descriptors[key].value, budget, depth + 1);
      if (item === undefined) return undefined;
      entries.push([wireText(key), item]);
    }
    return { kind: 'object', value: entries };
  } finally {
    budget.ancestors.delete(value);
  }
}

function project(value: unknown, budget: Budget, depth: number): RustCompactSnapshotValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) return undefined;
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return budget.compact ? null : { kind: 'null' };
  if (typeof value === 'boolean') return budget.compact ? value : { kind: 'boolean', value };
  if (typeof value === 'number') return { kind: 'number', value: numberBits(value) };
  if (typeof value === 'string') {
    budget.bytes += value.length * 6;
    if (budget.bytes > MAX_BYTES) return undefined;
    const text = wireText(value);
    return budget.compact && typeof text === 'string' ? text : { kind: 'string', value: text };
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
  return project(value, { nodes: 0, bytes: 0, ancestors: new Set(), compact: false }, 0) as
    | RustSnapshotValue
    | undefined;
}

/** The same descriptor and resource checks, with fewer allocations and smaller native requests. */
export function projectRustCompactSnapshotValue(value: unknown): RustCompactSnapshotValue | undefined {
  if (
    Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON') ||
    Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON')
  )
    return undefined;
  return project(value, { nodes: 0, bytes: 0, ancestors: new Set(), compact: true }, 0);
}
