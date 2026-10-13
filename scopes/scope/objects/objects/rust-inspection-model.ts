import { types } from 'util';
import type Version from '../models/version';
import { hasDefaultInspectionVersionMethods } from '../models/version';
import {
  hasRustSnapshotTransactionClass,
  hasRustSnapshotTransactionClassBatch,
  hasRustSnapshotTransactionClassFields,
  hasRustSnapshotFunctions,
} from './rust-snapshot-guards';
import {
  projectRustSnapshotValue,
  projectRustCompactSnapshotValue,
  type RustSnapshotValue,
  type RustCompactSnapshotValue,
} from './rust-snapshot-values';
import { canSortInspectionExtensionsNatively } from '@teambit/legacy.extension-data';
import {
  isRustWorkspaceInspection,
  requestRustWorkspaceInspection,
  retireRustWorkspaceInspection,
} from '@teambit/component.sources';

const semanticFields = [
  'mainFile',
  'files',
  'log',
  'dependencies',
  'devDependencies',
  'extensions',
  'packageDependencies',
  'devPackageDependencies',
  'peerPackageDependencies',
  'bindingPrefix',
  'overrides',
];
const packageFields = ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'];
const extensionFields = ['extensionId', 'name', 'legacyId', 'rawConfig'];
type Mode = 'modified' | 'sourceCode';
type Capture = {
  version: Version;
  fields: RustCompactSnapshotValue;
  files: any[];
  dependencies: any[];
  devDependencies: any[];
  extensions: any[];
  values: Record<string, any>;
  configs: any[];
  maps: Record<string, any>;
  filePaths: string[];
  fileArray: any[];
  configRefs: any[];
  overrideRefs: any[];
  dependencyArrays: { dependencies?: any[]; devDependencies?: any[] };
};
type Mutation = {
  fileOrder: number[];
  dependencyOrder?: number[];
  devDependencyOrder?: number[];
  extensionOrder?: number[];
  configAssignments?: Array<[number, RustSnapshotValue]>;
  packageKeys?: Record<string, number[][]>;
  overrideKeys?: Record<string, number[][]>;
  dependencyVersions?: Array<{ field: 'dependencies' | 'devDependencies'; index: number; modelIndex: number }>;
  fileMetadata?: Array<{ index: number; modelIndex: number }>;
};
type Plan = {
  modified: boolean;
  leftHash?: string;
  rightHash?: string;
  mutations: { left: Mutation; right: Mutation };
};

function dense(value: any, mutable = false): value is any[] {
  if (!hasRustSnapshotTransactionClass(value, 'Array') && !hasRustSnapshotTransactionClass(value, 'ComponentIdList'))
    return false;
  const own = Object.getOwnPropertyDescriptors(value);
  const length = own.length?.value;
  if (!Number.isSafeInteger(length) || length > 4096 || Reflect.ownKeys(own).length !== length + 1) return false;
  if (mutable && !own.length.writable) return false;
  for (let index = 0; index < length; index += 1) {
    if (!own[index] || !('value' in own[index]) || (mutable && !own[index].writable)) return false;
  }
  return true;
}

function writable(value: object, name: string): boolean {
  const field = Object.getOwnPropertyDescriptor(value, name);
  return field ? 'value' in field && field.writable === true : Object.isExtensible(value);
}

function identifier(value: any): Record<string, unknown> | undefined {
  if (!hasRustSnapshotTransactionClass(value, 'ComponentID')) return undefined;
  const legacy = Object.getOwnPropertyDescriptor(value, '_legacy')?.value;
  if (!hasRustSnapshotTransactionClass(legacy, 'BitId')) return undefined;
  const fields = Object.getOwnPropertyDescriptors(value);
  const rest: Record<string, unknown> = {};
  for (const name of Object.keys(fields)) if (name !== '_legacy') rest[name] = fields[name].value;
  if (!projectRustSnapshotValue(rest)) return undefined;
  const legacyValues = Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(legacy)).map(([name, descriptor]) => [name, descriptor.value])
  );
  if (!projectRustSnapshotValue(legacyValues)) return undefined;
  const projected = value.toObject();
  return value.scope === projected.scope ? projected : undefined;
}

function files(value: any, mode: Mode): { rows: any[]; original: any[] } | undefined {
  if (!dense(value)) return undefined;
  const rows: any[] = [];
  const references: object[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || types.isProxy(entry) || Object.getPrototypeOf(entry) !== Object.prototype) return undefined;
    const own = Object.getOwnPropertyDescriptors(entry),
      ref = own.file?.value;
    if (!ref || typeof ref !== 'object' || types.isProxy(ref)) return undefined;
    references.push(ref);
    const hash = Object.getOwnPropertyDescriptor(ref, 'hash')?.value;
    if (typeof hash !== 'string' || !/^[a-f0-9]{40}$/.test(hash) || typeof own.relativePath?.value !== 'string')
      return undefined;
    if (mode === 'modified') {
      if (!writable(entry, 'name') || !writable(entry, 'test')) return undefined;
      for (const name of ['file', 'relativePath', 'name', 'test'])
        if (own[name] && !('value' in own[name])) return undefined;
      rows.push({ file: hash, relativePath: own.relativePath.value, name: own.name?.value, test: own.test?.value });
    } else {
      const referenceFields = Object.getOwnPropertyDescriptors(ref);
      if (Reflect.ownKeys(referenceFields).length !== 1 || referenceFields.hash?.enumerable !== true) return undefined;
      const row: Record<string, unknown> = {};
      for (const name of Reflect.ownKeys(own)) {
        if (typeof name !== 'string' || !('value' in own[name])) return undefined;
        if (own[name].enumerable)
          Object.defineProperty(row, name, { value: name === 'file' ? { hash } : own[name].value, enumerable: true });
      }
      rows.push(row);
    }
  }
  return hasRustSnapshotTransactionClassBatch(references, 'Ref') ? { rows, original: value } : undefined;
}

function dependencies(value: any): { rows: any[]; original: any[] } | undefined {
  if (!hasRustSnapshotTransactionClass(value, 'Dependencies')) return undefined;
  const original = Object.getOwnPropertyDescriptor(value, 'dependencies')?.value;
  if (!dense(original, true)) return undefined;
  const rows: any[] = [];
  for (const dependency of original) {
    if (!ordinaryDependency(dependency) || !writable(dependency, 'id')) return undefined;
    const own = Object.getOwnPropertyDescriptors(dependency),
      id = identifier(own.id?.value);
    if (!id) return undefined;
    const rest: Record<string, unknown> = {};
    for (const name of Object.keys(own)) if (name !== 'id') rest[name] = own[name].value;
    if (!projectRustSnapshotValue(rest)) return undefined;
    rows.push({ id });
  }
  return { rows, original: original.slice() };
}

function ordinaryDependency(value: any): boolean {
  if (
    !value ||
    (!hasRustSnapshotTransactionClass(value, 'Dependency') &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
  )
    return false;
  const own = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(own).every((key) => typeof key === 'string' && 'value' in own[key]);
}

function extensions(value: any): { rows: any[]; original: any[] } | undefined {
  if (!hasRustSnapshotTransactionClass(value, 'ExtensionDataList')) return undefined;
  const own = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(own).length !== value.length + 1 || value.length > 4096) return undefined;
  const rows: any[] = [],
    original: any[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = own[index]?.value;
    if (
      !hasRustSnapshotTransactionClassFields(entry, 'ExtensionDataEntry', extensionFields) ||
      !writable(entry, 'rawConfig')
    )
      return undefined;
    const fields = Object.getOwnPropertyDescriptors(entry),
      id = fields.extensionId?.value,
      rawConfig = fields.rawConfig?.value;
    if (rawConfig !== '-' && (!rawConfig || typeof rawConfig !== 'object' || !projectRustSnapshotValue(rawConfig)))
      return undefined;
    const extensionId = id ? identifier(id) : undefined;
    if (id && !extensionId) return undefined;
    rows.push({ extensionId, name: fields.name?.value, legacyId: fields.legacyId?.value, rawConfig });
    original.push(entry);
  }
  return { rows, original };
}

function ordinaryMaps(values: Record<string, any>): boolean {
  for (const field of [...packageFields, 'overrides']) {
    const value = values[field];
    if (!projectRustSnapshotValue(value)) return false;
    if (value && (typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, '__proto__'))) return false;
  }
  if (values.overrides) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const value = Object.getOwnPropertyDescriptor(values.overrides, field)?.value;
      if (value && !writable(values.overrides, field)) return false;
    }
  }
  return true;
}

function safeCapture(version: Version, mode: Mode): Capture | undefined {
  try {
    return capture(version, mode);
  } catch {
    return undefined;
  }
}

function capture(version: Version, mode: Mode): Capture | undefined {
  if (
    !hasRustSnapshotTransactionClass([], 'Array') ||
    !hasRustSnapshotTransactionClassFields(version, 'Version', mode === 'modified' ? semanticFields : ['files'])
  )
    return undefined;
  if (
    !hasDefaultInspectionVersionMethods(version) ||
    !hasRustSnapshotFunctions(['Version', 'SnapshotJSON', 'Dependencies']) ||
    !canSortInspectionExtensionsNatively()
  )
    return undefined;
  const own = Object.getOwnPropertyDescriptors(version),
    selected: Record<string, any> = {};
  for (const field of mode === 'modified' ? semanticFields : ['files']) {
    selected[field] = own[field]?.value;
    if (!writable(version, field)) return undefined;
  }
  const fileRows = files(selected.files, mode);
  if (!fileRows) return undefined;
  if (mode === 'sourceCode') {
    const fields = projectRustCompactSnapshotValue({ files: fileRows.rows });
    return fields ? captured(version, fields, fileRows, selected) : undefined;
  }
  const deps = dependencies(selected.dependencies),
    devDeps = dependencies(selected.devDependencies),
    exts = extensions(selected.extensions);
  if (!deps || !devDeps || !exts || !ordinaryMaps(selected)) return undefined;
  if (!selected.log || ![Object.prototype, null].includes(Object.getPrototypeOf(selected.log))) return undefined;
  const log = Object.getOwnPropertyDescriptors(selected.log),
    logRow: Record<string, any> = {};
  for (const field of ['message', 'date', 'username', 'email']) {
    if (log[field] ? !('value' in log[field]) : Object.getOwnPropertyDescriptor(Object.prototype, field))
      return undefined;
    logRow[field] = log[field]?.value;
  }
  const fields = projectRustCompactSnapshotValue({
    ...selected,
    files: fileRows.rows,
    log: logRow,
    dependencies: deps.rows,
    devDependencies: devDeps.rows,
    extensions: exts.rows,
  });
  return fields
    ? captured(version, fields, fileRows, selected, deps.original, devDeps.original, exts.original)
    : undefined;
}

function captured(
  version: Version,
  fields: RustCompactSnapshotValue,
  fileRows: { rows: any[]; original: any[] },
  values: Record<string, any>,
  deps: any[] = [],
  devDeps: any[] = [],
  exts: any[] = []
): Capture {
  const copy = hydrate(fields);
  return {
    version,
    fields,
    files: fileRows.original.slice(),
    dependencies: deps,
    devDependencies: devDeps,
    extensions: exts,
    values,
    configs: (copy.extensions || []).map((entry) => entry.rawConfig),
    maps: copy,
    filePaths: fileRows.rows.map((row) => row.relativePath),
    fileArray: fileRows.original,
    configRefs: exts.map((entry) => Object.getOwnPropertyDescriptor(entry, 'rawConfig')?.value),
    overrideRefs: ['dependencies', 'devDependencies', 'peerDependencies'].map(
      (field) => Object.getOwnPropertyDescriptor(values.overrides || {}, field)?.value
    ),
    dependencyArrays: {
      dependencies: Object.getOwnPropertyDescriptor(values.dependencies || {}, 'dependencies')?.value,
      devDependencies: Object.getOwnPropertyDescriptor(values.devDependencies || {}, 'dependencies')?.value,
    },
  };
}

function permutation(value: any, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    new Set(value).size === length &&
    value.every((index) => Number.isInteger(index) && index >= 0 && index < length)
  );
}
function utf16(value: any): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= 65536 &&
    value.every((unit) => Number.isInteger(unit) && unit >= 0 && unit <= 65535)
  );
}
function wireText(value: any): value is string | number[] {
  return (typeof value === 'string' && value.length <= 65536) || utf16(value);
}
function text(units: string | number[]): string {
  if (typeof units === 'string') return units;
  let result = '';
  for (const unit of units) result += String.fromCharCode(unit);
  return result;
}
function hydrate(value: any, depth = 0): any {
  if (depth <= 64) {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string' && wireText(value)) return value;
    if (Array.isArray(value) && value.length <= 4096) return value.map((item) => hydrate(item, depth + 1));
  }
  if (!value || depth > 64) throw Error('invalid inspection value');
  switch (value.kind) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'boolean':
      if (typeof value.value === 'boolean') return value.value;
      break;
    case 'number':
      if (typeof value.value === 'string' && /^[0-9a-f]{16}$/.test(value.value))
        return Buffer.from(value.value, 'hex').readDoubleBE();
      break;
    case 'string':
      if (wireText(value.value)) return text(value.value);
      break;
    case 'array':
      if (Array.isArray(value.value) && value.value.length <= 4096)
        return value.value.map((item) => hydrate(item, depth + 1));
      break;
    case 'object': {
      if (!Array.isArray(value.value) || value.value.length > 4096) break;
      const result: Record<string, any> = {};
      for (const row of value.value) {
        if (!Array.isArray(row) || row.length !== 2 || !wireText(row[0])) throw Error('invalid inspection entry');
        const key = text(row[0]);
        if (Object.hasOwn(result, key)) throw Error('duplicate inspection entry');
        Object.defineProperty(result, key, {
          value: hydrate(row[1], depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    default:
      break;
  }
  throw Error('invalid inspection value');
}

function keysMatch(value: any, keys: any): boolean {
  if (!Array.isArray(keys) || !keys.every(utf16)) return false;
  const strings = keys.map(text),
    expected = value ? Object.keys(value) : [];
  return (
    strings.length === expected.length &&
    new Set(strings).size === expected.length &&
    strings.every((key) => expected.includes(key))
  );
}
function mutationsValid(value: any, before: Capture, mode: Mode): value is Mutation {
  if (!value || !permutation(value.fileOrder, before.files.length)) return false;
  if (mode === 'sourceCode') return Object.keys(value).length === 1;
  if (
    !permutation(value.dependencyOrder, before.dependencies.length) ||
    !permutation(value.devDependencyOrder, before.devDependencies.length) ||
    !permutation(value.extensionOrder, before.extensions.length)
  )
    return false;
  if (!Array.isArray(value.configAssignments) || value.configAssignments.length !== before.extensions.length)
    return false;
  const indices = new Set<number>();
  for (const row of value.configAssignments) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !Number.isInteger(row[0]) ||
      !before.extensions[row[0]] ||
      indices.has(row[0])
    )
      return false;
    indices.add(row[0]);
    const decoded = hydrate(row[1]),
      original = before.configs[row[0]];
    if (original === '-') {
      if (!decoded || Object.keys(decoded).length !== 0) return false;
    } else {
      if (
        !decoded ||
        !keysMatch(
          original,
          Object.keys(decoded).map((key) => Array.from({ length: key.length }, (_, index) => key.charCodeAt(index)))
        )
      )
        return false;
      for (const key of Object.keys(original)) {
        if (
          JSON.stringify(projectRustSnapshotValue(original[key])) !==
          JSON.stringify(projectRustSnapshotValue(decoded[key]))
        )
          return false;
      }
    }
  }
  if (!value.packageKeys || !value.overrideKeys) return false;
  for (const field of packageFields) if (!keysMatch(before.maps[field], value.packageKeys[field])) return false;
  for (const field of Object.keys(value.overrideKeys))
    if (
      !['dependencies', 'devDependencies', 'peerDependencies'].includes(field) ||
      !keysMatch(before.maps.overrides?.[field], value.overrideKeys[field])
    )
      return false;
  return true;
}

function alignmentValid(plan: Plan, left: Capture, right: Capture): boolean {
  const changes = plan.mutations.right;
  if (!Array.isArray(changes.dependencyVersions) || !Array.isArray(changes.fileMetadata)) return false;
  for (const row of changes.dependencyVersions) {
    if (
      !['dependencies', 'devDependencies'].includes(row.field) ||
      !Number.isInteger(row.index) ||
      !Number.isInteger(row.modelIndex) ||
      !right[row.field]?.[row.index] ||
      !left[row.field]?.[row.modelIndex]
    )
      return false;
  }
  return changes.fileMetadata.every(
    (row) =>
      Number.isInteger(row.index) &&
      Number.isInteger(row.modelIndex) &&
      right.files[row.index] &&
      left.files[row.modelIndex] &&
      right.filePaths[row.index] === left.filePaths[row.modelIndex]
  );
}

function ordered(value: any, keys: number[][]): any {
  if (!value) return value;
  const result: Record<string, any> = {};
  for (const key of keys)
    Object.defineProperty(result, text(key), {
      value: value[text(key)],
      writable: true,
      configurable: true,
      enumerable: true,
    });
  return result;
}
function apply(before: Capture, mutation: Mutation, mode: Mode): void {
  const version = before.version;
  version.files = mutation.fileOrder.map((index) => before.files[index]);
  if (mode === 'sourceCode') return;
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const indices = field === 'dependencies' ? mutation.dependencyOrder! : mutation.devDependencyOrder!;
    for (let index = 0; index < indices.length; index += 1)
      before.values[field].dependencies[index] = before[field][indices[index]];
  }
  for (const field of packageFields) version[field] = ordered(before.values[field], mutation.packageKeys![field]);
  for (const field of Object.keys(mutation.overrideKeys!))
    before.values.overrides[field] = ordered(before.values.overrides[field], mutation.overrideKeys![field]);
  for (const [index, config] of mutation.configAssignments!) before.extensions[index].config = hydrate(config);
  version.extensions = before.values.extensions.constructor.fromArray(
    mutation.extensionOrder!.map((index) => before.extensions[index])
  );
}

function unchanged(before: Capture, after?: Capture): boolean {
  return Boolean(
    after &&
      JSON.stringify(before.fields) === JSON.stringify(after.fields) &&
      before.fileArray === after.fileArray &&
      before.files.every((entry, index) => entry === after.files[index]) &&
      before.dependencies.every((entry, index) => entry === after.dependencies[index]) &&
      before.devDependencies.every((entry, index) => entry === after.devDependencies[index]) &&
      before.dependencyArrays.dependencies === after.dependencyArrays.dependencies &&
      before.dependencyArrays.devDependencies === after.dependencyArrays.devDependencies &&
      before.extensions.every((entry, index) => entry === after.extensions[index]) &&
      before.configRefs.every((entry, index) => entry === after.configRefs[index]) &&
      before.overrideRefs.every((entry, index) => entry === after.overrideRefs[index]) &&
      semanticFields.every((field) => before.values[field] === after.values[field])
  );
}

/** Rust owns semantic normalization and SHA comparison after the existing conversion callbacks. */
export async function compareRustInspectionVersions(
  leftVersion: Version,
  rightVersion: Version,
  workspaceRoot: boolean,
  mode: Mode = 'modified',
  eligible: () => boolean = () => true
): Promise<boolean | undefined> {
  if (!isRustWorkspaceInspection() || process.env.BIT_LOG || !eligible()) return undefined;
  const left = safeCapture(leftVersion, mode),
    right = safeCapture(rightVersion, mode);
  if (!left || !right) return undefined;
  if (
    leftVersion === rightVersion ||
    left.files.some((entry) => right.files.includes(entry)) ||
    left.dependencies.some((entry) => right.dependencies.includes(entry)) ||
    left.devDependencies.some((entry) => right.devDependencies.includes(entry))
  )
    return undefined;
  const plan = await requestRustWorkspaceInspection<Plan>(
    { kind: 'inspectionCompare', mode, left: left.fields, right: right.fields, workspaceRoot },
    (data): data is Plan => {
      try {
        return (
          typeof data?.modified === 'boolean' &&
          mutationsValid(data.mutations?.left, left, mode) &&
          mutationsValid(data.mutations?.right, right, mode) &&
          (mode === 'sourceCode' ||
            (/^[a-f0-9]{40}$/.test(data.leftHash) &&
              /^[a-f0-9]{40}$/.test(data.rightHash) &&
              data.modified === (data.leftHash !== data.rightHash) &&
              alignmentValid(data, left, right)))
        );
      } catch {
        return false;
      }
    }
  );
  if (!plan) return undefined;
  if (
    !eligible() ||
    !unchanged(left, safeCapture(leftVersion, mode)) ||
    !unchanged(right, safeCapture(rightVersion, mode))
  ) {
    await retireRustWorkspaceInspection();
    return undefined;
  }
  if (mode === 'modified') {
    for (const row of plan.mutations.right.dependencyVersions!)
      right[row.field][row.index].id = left[row.field][row.modelIndex].id;
    for (const row of plan.mutations.right.fileMetadata!) {
      right.files[row.index].name = left.files[row.modelIndex].name;
      right.files[row.index].test = left.files[row.modelIndex].test;
    }
  }
  apply(left, plan.mutations.left, mode);
  apply(right, plan.mutations.right, mode);
  return plan.modified;
}
