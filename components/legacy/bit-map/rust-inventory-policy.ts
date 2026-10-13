import { types } from 'util';
import ignore from 'ignore';
import type { RustInventoryPolicy } from '@teambit/component.sources';

const prototype = Object.getPrototypeOf(ignore());
const defaults = [prototype, Object.prototype, Array.prototype, RegExp.prototype].map(capture);
const regexSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')!.get!;
const regexFlags = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags')!.get!;
type Witness = { value: object; prototype: object | null; fields: PropertyDescriptorMap };
function capture(value: object): Witness {
  return { value, prototype: Object.getPrototypeOf(value), fields: Object.getOwnPropertyDescriptors(value) };
}
function fresh(witness: Witness): boolean {
  const { value, fields } = witness;
  if (
    Object.getPrototypeOf(value) !== witness.prototype ||
    Reflect.ownKeys(value).length !== Reflect.ownKeys(fields).length
  )
    return false;
  return Reflect.ownKeys(fields).every((key) => {
    const before = Reflect.get(fields, key) as PropertyDescriptor;
    const after = Object.getOwnPropertyDescriptor(value, key);
    return (
      after &&
      before.value === after.value &&
      before.get === after.get &&
      before.set === after.set &&
      before.writable === after.writable &&
      before.enumerable === after.enumerable &&
      before.configurable === after.configurable
    );
  });
}
function ordinary(value: unknown, expected: object): value is object {
  return Boolean(
    value && typeof value === 'object' && !types.isProxy(value) && Object.getPrototypeOf(value) === expected
  );
}
export function captureRustInventoryPolicy(
  value: unknown
):
  | { policy: RustInventoryPolicy; fresh: () => boolean; apply: (changes: Array<[string, boolean]>) => void }
  | undefined {
  if (!defaults.every(fresh) || !ordinary(value, prototype)) return undefined;
  const witnesses = [capture(value)];
  const fields = witnesses[0].fields;
  if (Reflect.get(fields, Symbol.for('node-ignore'))?.value !== true) return undefined;
  if (Reflect.ownKeys(fields).some((key) => !('value' in Reflect.get(fields, key)))) return undefined;
  if (Reflect.ownKeys(Object.getOwnPropertyDescriptors(prototype)).some((key) => Object.hasOwn(value, key)))
    return undefined;
  const rules = fields._rules?.value,
    cache = fields._cache?.value;
  if (
    !ordinary(rules, Array.prototype) ||
    !Array.isArray(rules) ||
    rules.length > 4096 ||
    !ordinary(cache, Object.prototype) ||
    !Object.isExtensible(cache)
  )
    return undefined;
  const ruleFields = Object.getOwnPropertyDescriptors(rules);
  if (Reflect.ownKeys(ruleFields).length !== rules.length + 1) return undefined;
  witnesses.push(capture(rules), capture(cache));
  const policy: RustInventoryPolicy = { rules: [], cache: [] };
  for (let index = 0; index < rules.length; index++) {
    const rule = ruleFields[index]?.value;
    if (!ordinary(rule, Object.prototype)) return undefined;
    const witness = capture(rule),
      negative = witness.fields.negative?.value,
      regex = witness.fields.regex?.value;
    if (
      typeof negative !== 'boolean' ||
      !ordinary(regex, RegExp.prototype) ||
      Reflect.ownKeys(regex).some((key) => key !== 'lastIndex')
    )
      return undefined;
    if (regexFlags.call(regex) !== 'i') return undefined;
    const source = regexSource.call(regex);
    if (source.length > 32768) return undefined;
    witnesses.push(witness, capture(regex));
    policy.rules.push({ source, negative });
  }
  for (const key of Reflect.ownKeys(witnesses[2].fields)) {
    const field = Reflect.get(witnesses[2].fields, key) as PropertyDescriptor;
    if (
      typeof key !== 'string' ||
      !('value' in field) ||
      typeof field.value !== 'boolean' ||
      !field.writable ||
      !field.enumerable ||
      !field.configurable
    )
      return undefined;
    policy.cache!.push([key, field.value]);
  }
  return {
    policy,
    fresh: () => defaults.every(fresh) && witnesses.every(fresh),
    apply: (changes) => {
      for (const [name, keep] of changes)
        Object.defineProperty(cache, name, { value: keep, enumerable: true, configurable: true, writable: true });
    },
  };
}
