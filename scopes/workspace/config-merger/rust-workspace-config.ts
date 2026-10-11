import { WorkspacePolicy, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { isRustSnapshotOperation } from '@teambit/objects';
import {
  eligibleSemverDefaults,
  normalizeSemverInputs,
  registerRustConfigSemver,
  requestRustConfig,
} from './rust-config-operation';
import {
  eligibleRustConfigLodash,
  hasRustConfigClass,
  hasRustConfigLogger,
  registerRustConfigClass,
  registerRustConfigStaticData,
  registerRustConfigLogger,
  registerRustConfigLodash,
} from './rust-config-guards';
import { ConfigMergeResult } from './config-merge-result';
import { WorkspaceConfig } from '@teambit/config';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import { isEmpty } from 'lodash';
import { Logger } from '@teambit/logger';
import { logger as legacyLogger } from '@teambit/legacy.logger';

type Constructor = { prototype: object };
// Registration can run through the configuration aspect's cyclic imports.
// eslint-disable-next-line no-var
var defaults:
  | {
      constructor: Constructor;
      methods: Map<string, unknown>;
      entries: PropertyDescriptor | undefined;
      extensions: PropertyDescriptor | undefined;
      isEmpty: unknown;
    }
  | undefined;
const arrayMethods = new Map(
  ['map', 'every', 'forEach', 'filter', 'reduce', 'find', 'slice'].map((name) => [name, Array.prototype[name]])
);
const names = [
  'updateWorkspaceJsoncWithDepsIfNeeded',
  'updateWorkspaceJsoncWithDepsWithinOperation',
  'updateDepsInWorkspaceConfig',
  'updateDepsInWorkspaceConfigWithinOperation',
  'updateWsConfigWithGivenChanges',
  'writeWorkspaceJsoncWithConflictsGracefully',
  'writeWorkspaceJsoncWithConflicts',
];
function descriptor(object: object, key: string): PropertyDescriptor | undefined {
  let owner: object | null = object;
  while (owner) {
    const found = Object.getOwnPropertyDescriptor(owner, key);
    if (found) return found;
    owner = Object.getPrototypeOf(owner);
  }
  return undefined;
}
export function registerRustWorkspaceConfig(constructor: Constructor): void {
  // Harmony can load the workspace runtime without evaluating the lazily
  // imported component merger. Both production entry points register defaults.
  registerRustConfigSemver();
  registerRustConfigLodash(require('lodash'));
  registerRustConfigLogger(Logger, legacyLogger);
  [Array, Map, ExtensionDataEntry, ExtensionDataList, ConfigMergeResult].forEach(registerRustConfigClass);
  registerRustConfigStaticData(ExtensionDataList, 'validateBeforePersistHook');
  defaults ||= {
    constructor,
    methods: new Map(names.map((name) => [name, descriptor(constructor.prototype, name)?.value])),
    entries: Object.getOwnPropertyDescriptor(WorkspacePolicy.prototype, 'entries'),
    extensions: Object.getOwnPropertyDescriptor(WorkspaceConfig.prototype, 'extensions'),
    isEmpty,
  };
}
export function canPlanWorkspaceConfig(owner: object): boolean {
  return Boolean(
    isRustSnapshotOperation() &&
      defaults &&
      isEmpty === defaults.isEmpty &&
      eligibleRustConfigLodash() &&
      hasRustConfigClass([], Array) &&
      hasRustConfigLogger(Object.getOwnPropertyDescriptor(owner, 'logger')?.value) &&
      Object.getPrototypeOf(owner) === defaults.constructor.prototype &&
      names.every((name) => descriptor(owner, name)?.value === defaults?.methods.get(name)) &&
      eligibleSemverDefaults()
  );
}
function plain(value: unknown): value is Record<string, any> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      Object.values(Object.getOwnPropertyDescriptors(value)).every((entry) => 'value' in entry)
  );
}
function array(value: unknown): value is any[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= 4096 &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).every(
      (entry) => entry && 'value' in entry
    ) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every((entry) => 'value' in entry) &&
    [...arrayMethods].every(([name, method]) => descriptor(value, name)?.value === method)
  );
}
const safeName = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 4096 && !['__proto__', 'constructor', 'prototype'].includes(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096;

export type WorkspaceUpdatesPlan = {
  hasDeps: boolean;
  updates: Array<[string, string, string]>;
  conflicts: {
    dependencies?: Array<{ name: string; version: string }>;
    peerDependencies?: Array<{ name: string; version: string }>;
  };
  logs: string[];
  warnings: string[];
};
function validUpdates(data: any): data is WorkspaceUpdatesPlan {
  return (
    plain(data) &&
    typeof data.hasDeps === 'boolean' &&
    array(data.updates) &&
    data.updates.every(
      (entry) => array(entry) && entry.length === 3 && safeName(entry[0]) && entry.slice(1).every(text)
    ) &&
    plain(data.conflicts) &&
    Object.keys(data.conflicts).every((key) => ['dependencies', 'peerDependencies'].includes(key)) &&
    Object.values(data.conflicts).every(
      (entries) =>
        array(entries) && entries.every((entry) => plain(entry) && safeName(entry.name) && text(entry.version))
    ) &&
    array(data.logs) &&
    data.logs.every(text) &&
    array(data.warnings) &&
    data.warnings.every(text)
  );
}

/** Callback collection stays in its original phase; Rust owns dependency policy decisions. */
export async function planWorkspaceUpdates(
  owner: object,
  workspacePolicy: WorkspacePolicy,
  componentDeps: Record<string, string[]>,
  strategy?: string
): Promise<WorkspaceUpdatesPlan | undefined> {
  const eligible = () =>
    canPlanWorkspaceConfig(owner) &&
    Object.getPrototypeOf(workspacePolicy) === WorkspacePolicy.prototype &&
    descriptor(workspacePolicy, 'entries')?.get === defaults?.entries?.get &&
    array(Object.getOwnPropertyDescriptor(workspacePolicy, '_policiesEntries')?.value) &&
    workspacePolicy.entries.every(
      (entry) =>
        plain(entry) &&
        safeName(entry.dependencyId) &&
        ['runtime', 'dev', 'peer'].includes(entry.lifecycleType) &&
        plain(entry.value) &&
        text(entry.value.version)
    ) &&
    plain(componentDeps) &&
    Object.entries(componentDeps).every(
      ([name, versions]) => safeName(name) && array(versions) && versions.every(text)
    );
  if (!eligible()) return undefined;
  const projection = () => ({
    workspaceEntries: workspacePolicy.entries.map(({ dependencyId, lifecycleType, value }) => ({
      dependencyId,
      lifecycleType,
      value: { version: value.version },
    })),
    componentDeps: Object.entries(componentDeps).map(([name, versions]) => ({ name, versions: [...versions] })),
    strategy,
  });
  const input = projection();
  const before = JSON.stringify(input);
  if (Buffer.byteLength(before) > 4 * 1024 * 1024) return undefined;
  const strings = input.workspaceEntries.map((entry) => entry.value.version);
  input.componentDeps.forEach((entry) => strings.push(...entry.versions));
  // The canonical prefix rule can form an invalid range; classification belongs
  // to npm's parser, while the native planner chooses when to use it.
  input.workspaceEntries.forEach((entry) =>
    input.componentDeps.forEach((dependency) => {
      if (entry.dependencyId === dependency.name)
        dependency.versions.forEach((version) => strings.push(entry.value.version[0] + version));
    })
  );
  const semver = normalizeSemverInputs(strings);
  if (!semver || !eligible() || JSON.stringify(projection()) !== before) return undefined;
  const plan = await requestRustConfig<WorkspaceUpdatesPlan>(
    { kind: 'configWorkspaceUpdates', ...input, semver },
    validUpdates
  );
  if (!plan || !eligible() || JSON.stringify(projection()) !== before) return undefined;
  return plan;
}

const fields = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
type Policy = Partial<Record<(typeof fields)[number], Array<{ name: string; version: string; force?: boolean }>>>;
type WorkspaceMergePlan = {
  changes: Array<{ field: (typeof fields)[number]; name: string; version: string }>;
  updates: Array<[string, string, string]>;
  conflicts: Policy;
  unchanged: Array<[string, string]>;
  removePackages: string[];
  debug: string[];
};
function policy(value: unknown): value is Policy {
  return (
    plain(value) &&
    Object.keys(value).every((key) => fields.includes(key as any)) &&
    Object.values(value).every(
      (entries) =>
        array(entries) &&
        entries.every(
          (entry) =>
            plain(entry) &&
            safeName(entry.name) &&
            text(entry.version) &&
            (entry.force === undefined || typeof entry.force === 'boolean')
        )
    )
  );
}
function mergeResponse(data: any): data is WorkspaceMergePlan {
  return (
    plain(data) &&
    array(data.changes) &&
    data.changes.every(
      (entry) => plain(entry) && fields.includes(entry.field) && safeName(entry.name) && text(entry.version)
    ) &&
    array(data.updates) &&
    data.updates.every(
      (entry) => array(entry) && entry.length === 3 && safeName(entry[0]) && entry.slice(1).every(text)
    ) &&
    policy(data.conflicts) &&
    !data.conflicts.devDependencies &&
    array(data.unchanged) &&
    data.unchanged.every((entry) => array(entry) && entry.length === 2 && safeName(entry[0]) && text(entry[1])) &&
    array(data.removePackages) &&
    data.removePackages.every(safeName) &&
    array(data.debug) &&
    data.debug.every(text)
  );
}
/** Guard the public result reader before bypassing its canonical aggregation. */
export async function planWorkspaceMerge(
  owner: object,
  results: ConfigMergeResult[]
): Promise<
  | {
      plan: WorkspaceMergePlan;
      workspaceConfig: WorkspaceConfig;
      workspacePolicy: Record<string, any>;
      resolverResults: any[];
    }
  | undefined
> {
  const collect = () => {
    if (!canPlanWorkspaceConfig(owner) || !array(results)) return undefined;
    const resolverResults: any[] = [];
    const records: Array<{ compId: string; mergedPolicy?: Policy; conflict?: Policy }> = [];
    for (const result of results) {
      if (
        !hasRustConfigClass(result, ConfigMergeResult) ||
        !safeName(Object.getOwnPropertyDescriptor(result, 'compIdStr')?.value)
      )
        return undefined;
      const rows = Object.getOwnPropertyDescriptor(result, 'results')?.value;
      if (!array(rows) || !rows.every((row) => plain(row) && text(row.id))) return undefined;
      const resolver = rows.find((row) => row.id === DependencyResolverAspect.id);
      resolverResults.push(resolver);
      let mergedPolicy: Policy | undefined;
      if (resolver?.mergedConfig && resolver.mergedConfig !== '-') {
        if (!plain(resolver.mergedConfig)) return undefined;
        mergedPolicy = resolver.mergedConfig.policy || {};
        if (!policy(mergedPolicy)) return undefined;
      }
      if (resolver?.conflict && !policy(resolver.conflict)) return undefined;
      records.push({ compId: result.compIdStr, mergedPolicy, conflict: resolver?.conflict });
    }
    // Preserve the canonical early return before accessing workspace configuration.
    if (
      !records.some((record) =>
        [record.mergedPolicy, record.conflict].some(
          (p) => p && fields.some((field) => p[field]?.some((entry) => !entry.force))
        )
      )
    )
      return undefined;
    const config = Object.getOwnPropertyDescriptor(owner, 'config')?.value;
    if (!config) return undefined;
    const workspaceConfig = Object.getOwnPropertyDescriptor(config, 'workspaceConfig')?.value;
    if (
      !workspaceConfig ||
      Object.getPrototypeOf(workspaceConfig) !== WorkspaceConfig.prototype ||
      descriptor(workspaceConfig, 'extensions')?.get !== defaults?.extensions?.get
    )
      return undefined;
    const extensions = Object.getOwnPropertyDescriptor(workspaceConfig, '_extensions')?.value;
    if (
      !hasRustConfigClass(extensions, ExtensionDataList) ||
      !Object.values(Object.getOwnPropertyDescriptors(extensions)).every((property) => 'value' in property) ||
      !extensions.every(
        (entry) =>
          hasRustConfigClass(entry, ExtensionDataEntry) &&
          Object.values(Object.getOwnPropertyDescriptors(entry)).every((property) => 'value' in property)
      )
    )
      return undefined;
    const resolverExtension = extensions.findCoreExtension(DependencyResolverAspect.id);
    const configValue = resolverExtension && Object.getOwnPropertyDescriptor(resolverExtension, 'rawConfig')?.value;
    if (!plain(configValue) || !plain(configValue.policy)) return undefined;
    const workspacePolicy = configValue.policy;
    if (
      !Object.entries(workspacePolicy).every(
        ([field, entries]) =>
          fields.includes(field as any) &&
          plain(entries) &&
          Object.entries(entries).every(([name, version]) => safeName(name) && text(version))
      )
    )
      return undefined;
    const input = { records, policy: workspacePolicy };
    const aliases: object[] = [];
    const retain = (value: any) => {
      if (!value || typeof value !== 'object') return;
      aliases.push(value);
      Object.values(value).forEach(retain);
    };
    records.forEach((record) => {
      retain(record.mergedPolicy);
      retain(record.conflict);
    });
    retain(workspacePolicy);
    return { input, workspaceConfig, workspacePolicy, resolverResults, aliases, fingerprint: JSON.stringify(input) };
  };
  const before = collect();
  if (!before || Buffer.byteLength(before.fingerprint) > 4 * 1024 * 1024) return undefined;
  const strings = Object.values(before.workspacePolicy).flatMap((entries) => Object.values(entries) as string[]);
  before.input.records.forEach((record) =>
    fields.forEach((field) =>
      record.conflict?.[field]?.forEach((entry) => {
        const other = entry.version.split('::')[2];
        if (typeof other === 'string') strings.push(/^[a-f0-9]{3,40}$/i.test(other) ? `0.0.0-${other}` : other);
      })
    )
  );
  const semver = normalizeSemverInputs(strings);
  if (!semver) return undefined;
  const plan = await requestRustConfig<WorkspaceMergePlan>(
    { kind: 'configWorkspaceMerge', ...before.input, semver },
    (data) => {
      if (!mergeResponse(data) || data.debug.length < data.changes.length) return false;
      const seen = new Set<string>();
      for (const change of data.changes) {
        if (
          !Object.prototype.hasOwnProperty.call(before.workspacePolicy, change.field) ||
          !Object.prototype.hasOwnProperty.call(before.workspacePolicy[change.field], change.name)
        )
          return false;
        const key = JSON.stringify([change.field, change.name]);
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    }
  );
  const after = collect();
  if (
    !plan ||
    !after ||
    before.fingerprint !== after.fingerprint ||
    before.workspaceConfig !== after.workspaceConfig ||
    before.workspacePolicy !== after.workspacePolicy ||
    before.resolverResults.some((result, index) => result !== after.resolverResults[index]) ||
    before.aliases.length !== after.aliases.length ||
    before.aliases.some((value, index) => value !== after.aliases[index]) ||
    before.input.records.some(
      (record, index) =>
        record.mergedPolicy !== after.input.records[index].mergedPolicy ||
        record.conflict !== after.input.records[index].conflict ||
        fields.some(
          (field) =>
            record.mergedPolicy?.[field] !== after.input.records[index].mergedPolicy?.[field] ||
            record.conflict?.[field] !== after.input.records[index].conflict?.[field]
        )
    )
  )
    return undefined;
  return {
    plan,
    workspaceConfig: before.workspaceConfig,
    workspacePolicy: before.workspacePolicy,
    resolverResults: before.resolverResults,
  };
}
