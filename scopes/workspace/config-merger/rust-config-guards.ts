type Registration = {
  constructor: any;
  statics: PropertyDescriptorMap;
  allowedStaticData: Set<string>;
  descriptors: Array<{ owner: object; values: PropertyDescriptorMap }>;
};
// eslint-disable-next-line no-var
var registrations: Registration[] | undefined;
// eslint-disable-next-line no-var
var lodashDefaults: { singleton: object; methods: Map<string, PropertyDescriptor | undefined> } | undefined;
export function registerRustConfigLodash(singleton: object): void {
  lodashDefaults ||= {
    singleton,
    methods: new Map(
      ['omit', 'uniqBy', 'uniqWith', 'compact', 'isEqual', 'isEmpty'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(singleton, name),
      ])
    ),
  };
}
export function eligibleRustConfigLodash(): boolean {
  if (!lodashDefaults) return false;
  for (const [name, original] of lodashDefaults.methods) {
    const live = Object.getOwnPropertyDescriptor(lodashDefaults.singleton, name);
    if (!live || !original || live.value !== original.value || live.get !== original.get || live.set !== original.set)
      return false;
  }
  return true;
}
// eslint-disable-next-line no-var
var loggerDefaults:
  | { constructor: any; singleton: any; methods: Map<string, PropertyDescriptor | undefined> }
  | undefined;
function findDescriptor(object: object, name: string): PropertyDescriptor | undefined {
  let current: object | null = object;
  while (current) {
    const found = Object.getOwnPropertyDescriptor(current, name);
    if (found) return found;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}
export function registerRustConfigLogger(constructor: any, singleton: any): void {
  registerRustConfigClass(constructor);
  loggerDefaults ||= {
    constructor,
    singleton,
    methods: new Map(
      ['debug', 'trace', 'info', 'warn', 'error'].map((name) => [name, findDescriptor(singleton, name)])
    ),
  };
}
export function hasRustConfigLogger(value: any): boolean {
  if (!loggerDefaults || !hasRustConfigClass(value, loggerDefaults.constructor)) return false;
  const own = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(own);
  for (let index = 0; index < keys.length; index += 1) {
    if (!('value' in (own as any)[keys[index]])) return false;
  }
  for (const [name, original] of loggerDefaults.methods) {
    const live = findDescriptor(loggerDefaults.singleton, name);
    if (!live || !original || live.value !== original.value || live.get !== original.get || live.set !== original.set)
      return false;
  }
  return true;
}
export function registerRustConfigClass(constructor: any): void {
  if (!constructor?.prototype) return;
  registrations ||= [];
  if (registrations.some((entry) => entry.constructor === constructor)) return;
  const descriptors: Registration['descriptors'] = [];
  let owner = constructor.prototype;
  while (owner && owner !== Object.prototype) {
    descriptors.push({ owner, values: Object.getOwnPropertyDescriptors(owner) });
    owner = Object.getPrototypeOf(owner);
  }
  registrations.push({
    constructor,
    statics: Object.getOwnPropertyDescriptors(constructor),
    descriptors,
    allowedStaticData: new Set(),
  });
}
/** Config merging does not read the framework's persistence validation callback. */
export function registerRustConfigStaticData(constructor: any, name: string): void {
  registerRustConfigClass(constructor);
  registration(constructor)?.allowedStaticData.add(name);
}
export function hasRustConfigConstructor(constructor: any): boolean {
  const registered = registration(constructor);
  if (!registered) return false;
  const names = Reflect.ownKeys(registered.statics);
  const currentNames = Reflect.ownKeys(constructor);
  let allowedAdditional = 0;
  for (let index = 0; index < currentNames.length; index += 1) {
    const name = currentNames[index];
    if (typeof name === 'string' && registered.allowedStaticData.has(name)) {
      if (!('value' in (Object.getOwnPropertyDescriptor(constructor, name) || {}))) return false;
      if (!Object.prototype.hasOwnProperty.call(registered.statics, name)) allowedAdditional += 1;
    }
  }
  if (currentNames.length !== names.length + allowedAdditional) return false;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const original = (registered.statics as any)[name] as PropertyDescriptor;
    const live = Object.getOwnPropertyDescriptor(constructor, name);
    if (
      (typeof name === 'string' && registered.allowedStaticData.has(name)) ||
      (typeof original.value !== 'function' && !original.get && !original.set)
    ) {
      if (!live || !('value' in live)) return false;
      if (name === 'prototype' && live.value !== original.value) return false;
    } else if (live?.value !== original.value || live?.get !== original.get || live?.set !== original.set) return false;
  }
  return true;
}
function registration(constructor: any, value?: object): Registration | undefined {
  if (!registrations) return undefined;
  for (let index = 0; index < registrations.length; index += 1) {
    const entry = registrations[index];
    if (
      constructor
        ? entry.constructor === constructor
        : value && Object.getPrototypeOf(value) === entry.constructor.prototype
    )
      return entry;
  }
  return undefined;
}
export function hasRustConfigClass(value: any, constructor?: any): boolean {
  if (!value) return false;
  const registered = registration(constructor, value);
  constructor ||= registered?.constructor;
  if (
    !registered ||
    !hasRustConfigConstructor(constructor) ||
    !value ||
    Object.getPrototypeOf(value) !== constructor.prototype
  )
    return false;
  for (let index = 0; index < registered.descriptors.length; index += 1) {
    const { owner, values } = registered.descriptors[index];
    const live = Object.getOwnPropertyDescriptors(owner);
    if (Reflect.ownKeys(live).length !== Reflect.ownKeys(values).length) return false;
    const names = Reflect.ownKeys(values);
    for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      const name = names[nameIndex];
      const descriptor = (values as any)[name] as PropertyDescriptor;
      const current = (live as any)[name] as PropertyDescriptor;
      if (
        !current ||
        current.value !== descriptor.value ||
        current.get !== descriptor.get ||
        current.set !== descriptor.set
      )
        return false;
      if (name !== 'constructor' && (typeof descriptor.value === 'function' || descriptor.get || descriptor.set)) {
        if (Object.prototype.hasOwnProperty.call(value, name)) return false;
      }
    }
  }
  return true;
}
/** Bound, accessor-free JSON domain. Unsupported lodash values retain the canonical path. */
export function isRustConfigJson(value: any, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array && Object.keys(descriptors).length !== value.length + 1) return false;
  seen.add(value);
  const valid = Object.entries(descriptors).every(([name, descriptor]) => {
    if (array && name === 'length') return true;
    if (array && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length)) return false;
    return descriptor.enumerable && 'value' in descriptor && isRustConfigJson(descriptor.value, seen, depth + 1);
  });
  seen.delete(value);
  return valid;
}
