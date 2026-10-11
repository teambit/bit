import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import {
  hasRustConfigClass,
  isRustConfigJson,
  registerRustConfigClass,
  registerRustConfigStaticData,
} from './rust-config-guards';
import { isRustConfigOperation, requestRustConfig } from './rust-config-operation';

type Field = { field: string; entries: Array<{ name: string; version: string }> };
type Plan = {
  appendOrder: string[];
  fields: Array<{
    field: string;
    append: Array<{ name: string; version: string; force: true }>;
    retain: Array<{ original: number } | { appended: number }>;
    delete: boolean;
  }>;
};
// eslint-disable-next-line no-var
var defaults: { constructor: any; methods: Map<string, unknown> } | undefined;
const methods = ['mergeScopeSpecificDepsPolicy', 'addScopePolicyToMergedArray', 'filterDeletedDependenciesFromConfig'];
export function registerRustScopePolicy(constructor: any): void {
  [Array, ExtensionDataList, ExtensionDataEntry].forEach(registerRustConfigClass);
  registerRustConfigStaticData(ExtensionDataList, 'validateBeforePersistHook');
  defaults ||= {
    constructor,
    methods: new Map(
      methods.map((name) => [name, Object.getOwnPropertyDescriptor(constructor.prototype, name)?.value])
    ),
  };
}
function eligible(owner: object): boolean {
  return Boolean(
    defaults &&
      Object.getPrototypeOf(owner) === defaults.constructor.prototype &&
      methods.every(
        (name) =>
          !Object.getOwnPropertyDescriptor(owner, name) &&
          Object.getOwnPropertyDescriptor(defaults!.constructor.prototype, name)?.value === defaults!.methods.get(name)
      ) &&
      hasRustConfigClass([], Array)
  );
}
function safeName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 4096 && !['__proto__', 'constructor', 'prototype'].includes(name);
}
function plain(value: any): boolean {
  return Boolean(
    value &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      !Object.getOwnPropertySymbols(value).length &&
      Object.values(Object.getOwnPropertyDescriptors(value)).every((entry) => 'value' in entry)
  );
}
function projection(owner: object, extensions: ExtensionDataList, config: Record<string, any>) {
  if (!eligible(owner) || !plain(config)) return undefined;
  const resolver = Object.getOwnPropertyDescriptor(config, DependencyResolverAspect.id)?.value;
  if (!plain(resolver)) return undefined;
  const policy = Object.getOwnPropertyDescriptor(resolver, 'policy')?.value;
  if (!plain(policy) || !Object.isExtensible(policy) || !isRustConfigJson(policy)) return undefined;
  const merged: Field[] = [];
  const arrays = new Map<string, any[]>();
  for (const field of Object.keys(policy)) {
    const property = Object.getOwnPropertyDescriptor(policy, field)!;
    const entries = property.value;
    if (
      !safeName(field) ||
      !property.writable ||
      !property.configurable ||
      !hasRustConfigClass(entries, Array) ||
      !Object.isExtensible(entries) ||
      !Object.getOwnPropertyDescriptor(entries, 'length')?.writable ||
      entries.length > 4096 ||
      !entries.every(
        (entry: any) =>
          plain(entry) && safeName(entry.name) && typeof entry.version === 'string' && entry.version.length <= 4096
      )
    )
      return undefined;
    merged.push({ field, entries: entries.map((entry: any) => ({ name: entry.name, version: entry.version })) });
    arrays.set(field, entries);
  }
  if (!hasRustConfigClass(extensions, ExtensionDataList) || extensions.length > 4096) return undefined;
  const listProperties = Object.getOwnPropertyDescriptors(extensions);
  if (Reflect.ownKeys(listProperties).some((key) => !('value' in (listProperties as any)[key]))) return undefined;
  for (const entry of extensions) {
    if (!hasRustConfigClass(entry, ExtensionDataEntry) || !plainEntry(entry)) return undefined;
  }
  const extension = extensions.findCoreExtension(DependencyResolverAspect.id);
  const scope: Field[] = [];
  if (extension) {
    const rawConfig = Object.getOwnPropertyDescriptor(extension, 'rawConfig')?.value;
    if (!plain(rawConfig)) return undefined;
    const scopePolicy = Object.getOwnPropertyDescriptor(rawConfig, 'policy')?.value;
    if (scopePolicy) {
      if (!plain(scopePolicy) || !isRustConfigJson(scopePolicy)) return undefined;
      for (const field of Object.keys(scopePolicy)) {
        const entries = scopePolicy[field];
        if (
          !safeName(field) ||
          !plain(entries) ||
          Object.keys(entries).length > 4096 ||
          (field in policy && !Object.prototype.hasOwnProperty.call(policy, field))
        )
          return undefined;
        const rows: Field['entries'] = [];
        for (const name of Object.keys(entries)) {
          const version = entries[name];
          if (!safeName(name) || typeof version !== 'string' || version.length > 4096) return undefined;
          rows.push({ name, version });
        }
        scope.push({ field, entries: rows });
      }
    }
  }
  if (merged.length + scope.length > 4096) return undefined;
  const input = { kind: 'configScopePolicy', merged, scope };
  const fingerprint = JSON.stringify({ input, policy });
  if (Buffer.byteLength(fingerprint) > 4 * 1024 * 1024) return undefined;
  return {
    input,
    policy,
    arrays,
    fingerprint,
    entryRefs: new Map([...arrays].map(([field, entries]) => [field, entries.slice()])),
  };
}
function plainEntry(entry: object): boolean {
  return Reflect.ownKeys(entry).every((key) => 'value' in (Object.getOwnPropertyDescriptor(entry, key) || {}));
}
/** Rescue scope policy and remove deletion markers in the shared native operation. */
export async function tryRustScopePolicy(
  owner: object,
  extensions: ExtensionDataList,
  config: Record<string, any>
): Promise<boolean> {
  if (!isRustConfigOperation()) return false;
  const before = projection(owner, extensions, config);
  if (!before) return false;
  const expected = before.input.merged.map((field) => field.field);
  for (const field of before.input.scope) if (!expected.includes(field.field)) expected.push(field.field);
  const plan = await requestRustConfig<Plan>(before.input, (value) => {
    if (!isRustConfigJson(value) || !Array.isArray(value.fields) || !Array.isArray(value.appendOrder)) return false;
    if (JSON.stringify(value.appendOrder) !== JSON.stringify(before.input.scope.map((field) => field.field)))
      return false;
    if (JSON.stringify(value.fields.map((field: any) => field.field)) !== JSON.stringify(expected)) return false;
    return value.fields.every((field: any) => {
      const original = before.arrays.get(field.field) || [];
      if (!Array.isArray(field.append) || !Array.isArray(field.retain) || typeof field.delete !== 'boolean')
        return false;
      if (field.append.length > 4096 || field.retain.length > 4096 || field.delete !== (field.retain.length === 0))
        return false;
      if (
        !field.append.every(
          (entry: any) =>
            plain(entry) && safeName(entry.name) && typeof entry.version === 'string' && entry.force === true
        )
      )
        return false;
      return field.retain.every((selector: any) => {
        const keys = Object.keys(selector);
        if (keys.length !== 1 || !['original', 'appended'].includes(keys[0])) return false;
        const index = selector[keys[0]];
        return (
          Number.isInteger(index) &&
          index >= 0 &&
          index < (keys[0] === 'original' ? original.length : field.append.length)
        );
      });
    });
  });
  if (!plan) return false;
  const after = projection(owner, extensions, config);
  if (!after || after.policy !== before.policy || after.fingerprint !== before.fingerprint) return false;
  for (const [field, entries] of before.arrays) {
    if (
      after.arrays.get(field) !== entries ||
      before.entryRefs.get(field)!.some((entry, index) => after.arrays.get(field)![index] !== entry)
    )
      return false;
  }
  const rows = new Map(plan.fields.map((field) => [field.field, field]));
  for (const field of plan.appendOrder) {
    const row = rows.get(field)!;
    let entries = before.arrays.get(field);
    if (!entries) {
      entries = [];
      before.policy[field] = entries;
      before.arrays.set(field, entries);
    }
    entries.push(...row.append);
  }
  for (const field of plan.fields) {
    if (field.delete) delete before.policy[field.field];
    else
      before.policy[field.field] = field.retain.map((selector) =>
        'original' in selector ? before.arrays.get(field.field)![selector.original] : field.append[selector.appended]
      );
  }
  return true;
}
