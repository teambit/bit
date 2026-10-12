import { types } from 'util';

type DescriptorEntry = { key: string | symbol; descriptor: PropertyDescriptor };
function descriptorEntries(object: object): DescriptorEntry[] {
  return Reflect.ownKeys(object).map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(object, key)! }));
}

type ClassDefaults = {
  constructor: any;
  prototypes: Array<{ owner: object; entries: DescriptorEntry[] }>;
  statics: DescriptorEntry[];
  staticKeys: Set<string | symbol>;
  mutableStatics: Set<string>;
};
// Class modules can encounter this registry during cyclic initialization.
// eslint-disable-next-line no-var
var classes: Map<string, ClassDefaults> | undefined;

function sameDescriptor(before: PropertyDescriptor, after?: PropertyDescriptor, mutable = false): boolean {
  return Boolean(
    after &&
      before.get === after.get &&
      before.set === after.set &&
      before.configurable === after.configurable &&
      before.enumerable === after.enumerable &&
      before.writable === after.writable &&
      (mutable || before.value === after.value)
  );
}

/** Register only from the defining module, immediately after its canonical class declaration. */
export function registerRustSnapshotTransactionClass(
  name: string,
  constructor: any,
  mutableStatics: string[] = []
): void {
  if (!constructor || !constructor.prototype || classes?.has(name)) return;
  const prototypes: ClassDefaults['prototypes'] = [];
  let current = constructor.prototype;
  while (current && current !== Object.prototype) {
    prototypes.push({ owner: current, entries: descriptorEntries(current) });
    current = Object.getPrototypeOf(current);
  }
  classes ||= new Map();
  classes.set(name, {
    constructor,
    prototypes,
    statics: descriptorEntries(constructor),
    staticKeys: new Set(Reflect.ownKeys(constructor)),
    mutableStatics: new Set(mutableStatics),
  });
}

function unchanged(defaults: ClassDefaults): boolean {
  const keys = Reflect.ownKeys(defaults.constructor);
  for (const key of keys) {
    if (
      !defaults.staticKeys.has(key) &&
      (typeof key !== 'string' ||
        !defaults.mutableStatics.has(key) ||
        !('value' in Object.getOwnPropertyDescriptor(defaults.constructor, key)!))
    )
      return false;
  }
  for (const { key, descriptor } of defaults.statics) {
    if (
      !sameDescriptor(
        descriptor,
        Object.getOwnPropertyDescriptor(defaults.constructor, key),
        typeof key === 'string' && defaults.mutableStatics.has(key)
      )
    )
      return false;
  }
  let prototype = defaults.constructor.prototype;
  for (const entry of defaults.prototypes) {
    if (prototype !== entry.owner || Reflect.ownKeys(prototype).length !== entry.entries.length) return false;
    for (const { key, descriptor } of entry.entries) {
      if (!sameDescriptor(descriptor, Object.getOwnPropertyDescriptor(prototype, key))) return false;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return prototype === Object.prototype;
}

/** Pure descriptor checks do not invoke getters or custom methods during speculative planning. */
function hasClassFields(value: unknown, name: string, fields?: ReadonlySet<string>): boolean {
  const defaults = classes?.get(name);
  return Boolean(defaults && unchanged(defaults) && hasInstanceFields(value, defaults, fields));
}

function hasInstanceFields(value: unknown, defaults: ClassDefaults, fields?: ReadonlySet<string>): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== defaults.constructor.prototype
  )
    return false;
  for (const key of Reflect.ownKeys(value)) {
    if (
      (!fields || (typeof key === 'string' && fields.has(key))) &&
      !('value' in Object.getOwnPropertyDescriptor(value, key)!)
    )
      return false;
  }
  for (const entry of defaults.prototypes) {
    for (const { key } of entry.entries) {
      if (key === 'length' && Array.isArray(value)) continue;
      if (Object.getOwnPropertyDescriptor(value, key)) return false;
    }
  }
  return true;
}

export function hasRustSnapshotTransactionClass(value: unknown, name: string): boolean {
  return hasClassFields(value, name);
}

/** Semantic readers inspect selected data fields while retaining all defining method guards. */
export function hasRustSnapshotTransactionClassFields(value: unknown, name: string, fields: string[]): boolean {
  return hasClassFields(value, name, new Set(fields));
}

/** A synchronous descriptor-only batch: shared prototypes are checked once, never cached across calls. */
export function hasRustSnapshotTransactionClassFieldsBatch(
  values: readonly unknown[],
  name: string,
  fields: string[]
): boolean {
  if (types.isProxy(values) || !Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype)
    return false;
  const defaults = classes?.get(name);
  if (!defaults || !unchanged(defaults)) return false;
  const selected = new Set(fields);
  const length = Object.getOwnPropertyDescriptor(values, 'length')!.value;
  for (let index = 0; index < length; index++) {
    const entry = Object.getOwnPropertyDescriptor(values, String(index));
    if (!entry || !('value' in entry) || !hasInstanceFields(entry.value, defaults, selected)) return false;
  }
  return true;
}

/** Metadata hydration must use the original defining constructor and its unchanged methods. */
export function hasRustSnapshotTransactionClassConstructor(name: string, constructor: unknown): boolean {
  const defaults = classes?.get(name);
  return Boolean(defaults && constructor === defaults.constructor && unchanged(defaults));
}

// eslint-disable-next-line no-var
var modelHooks: Map<Function, () => boolean> | undefined;
// eslint-disable-next-line no-var
var validationHooks: Map<Function, () => boolean> | undefined;
// eslint-disable-next-line no-var
var functionReferences: Map<string, Function> | undefined;
// eslint-disable-next-line no-var
var functions:
  | Map<string, { object: object; descriptors: PropertyDescriptorMap; owners: Map<string, object> }>
  | undefined;

function definingDescriptor(
  object: object,
  key: string
): { owner: object; descriptor: PropertyDescriptor } | undefined {
  let owner: object | null = object;
  while (owner) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) return { owner, descriptor };
    owner = Object.getPrototypeOf(owner);
  }
  return undefined;
}

export function registerRustSnapshotFunctions(name: string, object: object, keys: string[]): void {
  functions ||= new Map();
  if (functions.has(name)) return;
  const descriptors: PropertyDescriptorMap = {};
  const owners = new Map<string, object>();
  for (let index = 0; index < keys.length; index += 1) {
    const field = definingDescriptor(object, keys[index]);
    if (!field || !('value' in field.descriptor)) return;
    descriptors[keys[index]] = field.descriptor;
    owners.set(keys[index], field.owner);
  }
  functions.set(name, { object, descriptors, owners });
}

export function hasRustSnapshotFunctions(names: string[]): boolean {
  for (let index = 0; index < names.length; index += 1) {
    const defaults = functions?.get(names[index]);
    if (!defaults) return false;
    const keys = Object.keys(defaults.descriptors);
    for (let field = 0; field < keys.length; field += 1) {
      const key = keys[field];
      const current = definingDescriptor(defaults.object, key);
      if (
        !current ||
        current.owner !== defaults.owners.get(key) ||
        !sameDescriptor(defaults.descriptors[key], current.descriptor)
      )
        return false;
    }
  }
  return true;
}

export function hasRustSnapshotMethods(value: object, name: string): boolean {
  const defaults = functions?.get(name);
  if (!defaults || Object.getPrototypeOf(value) !== defaults.object || !hasRustSnapshotFunctions([name])) return false;
  const keys = Object.keys(defaults.descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    if (Object.getOwnPropertyDescriptor(value, keys[index])) return false;
  }
  return true;
}

/** Internal framework hooks are registered where their canonical closures are defined. */
export function registerRustSnapshotModelHook(hook: Function, stable: () => boolean): void {
  modelHooks ||= new Map();
  if (!modelHooks.has(hook)) modelHooks.set(hook, stable);
}

/** Capture the actual defining function once; adapter reloads cannot bless replacements. */
export function registerRustSnapshotFunctionReference(name: string, value: Function): void {
  functionReferences ||= new Map();
  if (!functionReferences.has(name)) functionReferences.set(name, value);
}

export function hasRustSnapshotFunctionReference(name: string, value: unknown): boolean {
  return typeof value === 'function' && functionReferences?.get(name) === value;
}

/** The framework validator is a public callback; unknown replacements remain canonical. */
export function registerRustSnapshotValidationHook(hook: Function, stable: () => boolean): void {
  validationHooks ||= new Map();
  if (!validationHooks.has(hook)) validationHooks.set(hook, stable);
}

export function hasRustSnapshotValidationHook(list: unknown): boolean {
  if (!hasRustSnapshotTransactionClass(list, 'ExtensionDataList')) return false;
  const defaults = classes!.get('ExtensionDataList')!;
  const descriptor = Object.getOwnPropertyDescriptor(defaults.constructor, 'validateBeforePersistHook');
  if (!descriptor) return true;
  if (!('value' in descriptor)) return false;
  if (descriptor.value === undefined) return true;
  const stable = validationHooks?.get(descriptor.value);
  return Boolean(stable && stable());
}

export function hasRustSnapshotModelHooks(list: unknown): boolean {
  if (!hasRustSnapshotTransactionClass(list, 'ExtensionDataList')) return false;
  const defaults = classes!.get('ExtensionDataList')!;
  const descriptor = Object.getOwnPropertyDescriptor(defaults.constructor, 'toModelObjectsHook');
  const hooks = descriptor && 'value' in descriptor && descriptor.value;
  if (!Array.isArray(hooks) || !hasRustSnapshotTransactionClass(hooks, 'Array')) return false;
  const own = Object.getOwnPropertyDescriptors(hooks);
  if (Reflect.ownKeys(own).length !== hooks.length + 1) return false;
  for (let index = 0; index < hooks.length; index += 1) {
    const hook = own[index]?.value;
    if (typeof hook !== 'function') return false;
    const stable = modelHooks?.get(hook);
    if (!stable || !stable()) return false;
  }
  return true;
}
