type Defaults = { constructor: any; statics: PropertyDescriptorMap; prototype: PropertyDescriptorMap };
// Defining classes can register through partially initialized package imports.
// eslint-disable-next-line no-var
var defaults: Map<string, Defaults> | undefined;
// eslint-disable-next-line no-var
var functions: Array<{ owner: object; name: string; descriptor: PropertyDescriptor | undefined }> | undefined;
export function registerRecoveryBitmapClass(name: string, constructor: any): void {
  defaults ||= new Map();
  if (defaults.has(name)) return;
  defaults.set(name, {
    constructor,
    statics: Object.getOwnPropertyDescriptors(constructor),
    prototype: Object.getOwnPropertyDescriptors(constructor.prototype),
  });
}
export function registerRecoveryBitmapFunctions(owner: object, names: string[]): void {
  functions ||= [];
  for (const name of names) {
    if (functions.some((entry) => entry.owner === owner && entry.name === name)) continue;
    functions.push({ owner, name, descriptor: Object.getOwnPropertyDescriptor(owner, name) });
  }
}
function unchanged(owner: object, captured: PropertyDescriptorMap): boolean {
  const actual = Object.getOwnPropertyDescriptors(owner);
  if (Reflect.ownKeys(actual).length !== Reflect.ownKeys(captured).length) return false;
  return Reflect.ownKeys(captured).every((name) => {
    const previous = (captured as any)[name];
    const live = (actual as any)[name];
    return (
      live &&
      live.value === previous.value &&
      live.get === previous.get &&
      live.set === previous.set &&
      live.enumerable === previous.enumerable &&
      live.configurable === previous.configurable &&
      live.writable === previous.writable
    );
  });
}
function ordinary(value: any, name: string): boolean {
  const registration = defaults?.get(name);
  return Boolean(
    registration &&
      value &&
      Object.getPrototypeOf(value) === registration.constructor.prototype &&
      Reflect.ownKeys(value).every((key) => {
        const property = Object.getOwnPropertyDescriptor(value, key)!;
        return 'value' in property && !Object.prototype.hasOwnProperty.call(registration.constructor.prototype, key);
      })
  );
}
export function canRecoverBitmapNatively(bitmap: any): boolean {
  if (!functions || !defaults || !ordinary(bitmap, 'BitMap')) return false;
  for (const entry of functions) {
    const actual = Object.getOwnPropertyDescriptor(entry.owner, entry.name);
    if (
      !actual ||
      !entry.descriptor ||
      !('value' in actual) ||
      !Object.keys(entry.descriptor).every((key) => entry.descriptor![key] === actual[key])
    )
      return false;
  }
  for (const entry of defaults.values()) {
    if (!unchanged(entry.constructor, entry.statics) || !unchanged(entry.constructor.prototype, entry.prototype))
      return false;
  }
  const components = Object.getOwnPropertyDescriptor(bitmap, 'components')?.value;
  return (
    Array.isArray(components) &&
    Object.getPrototypeOf(components) === Array.prototype &&
    !Object.getOwnPropertySymbols(components).length &&
    Object.keys(components).length === components.length &&
    Object.entries(Object.getOwnPropertyDescriptors(components)).every(
      ([key, property]) =>
        key === 'length' ||
        ('value' in property &&
          /^(0|[1-9][0-9]*)$/.test(key) &&
          Number(key) < components.length &&
          ordinary(property.value, 'ComponentMap'))
    )
  );
}
