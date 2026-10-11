import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
import { VariantPolicy, DependencyResolverAspect } from '@teambit/dependency-resolver';
import { BuilderAspect } from '@teambit/builder';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import { omit } from 'lodash';
import type { ComponentConfigMerger, MergeStrategyResult } from './component-config-merger';
import { ConfigMergeResult } from './config-merge-result';
import {
  hasRustConfigClass,
  hasRustConfigConstructor,
  hasRustConfigLogger,
  eligibleRustConfigLodash,
  isRustConfigJson,
} from './rust-config-guards';
import { isRustConfigOperation, normalizeSemverInputs, requestRustConfig } from './rust-config-operation';

type Side = 'current' | 'base' | 'other';
type ConfigValue = { source: { side: Side; index: number } } | { value: any };
type Plan = {
  state: { handledExtIds: string[]; envs: Array<{ id: string; version?: string; sourceIndex?: number }> };
  logs: Array<{ level: 'debug' | 'trace'; message: string; meta?: any[]; metaUndefined?: boolean }>;
  configRows: Array<{
    id: string;
    deps?: boolean;
    merged?: ConfigValue;
    conflict?:
      | { kind: 'basic'; current: ConfigValue; other: ConfigValue; base?: ConfigValue; baseOwn?: boolean }
      | { kind: 'deps'; value: any };
  }>;
  dataAssignments: Array<{ current: number; other: number }>;
  conflictedAspects: Array<{ id: string; reason: string }>;
};
type Snapshot = {
  input: any;
  configs: Record<Side, any[]>;
  entries: Record<Side, ExtensionDataEntry[]>;
  fingerprint: string;
  references: object[];
};
function ownData(value: object): boolean {
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => 'value' in descriptor);
}
function idProjection(
  id: ComponentID,
  workspace = false
): { base: string; full: string; legacy?: string; version?: string } | undefined {
  if (!hasRustConfigClass(id, ComponentID) || !ownData(id)) return undefined;
  const legacy = (id as any)._legacy;
  // ComponentID owns its canonical legacy identity; its serializer is used by
  // the public merger when pinning a newly introduced workspace aspect.
  if (!hasRustConfigClass(legacy, BitId) || !ownData(legacy)) return undefined;
  return {
    base: id.toStringWithoutVersion(),
    full: id.toString(),
    ...(workspace ? { legacy: legacy.toString() } : {}),
    version: id.version,
  };
}
function eligibleMerger(merger: ComponentConfigMerger): boolean {
  const state = merger as any;
  if (!eligibleRustConfigLodash()) return false;
  if (!hasRustConfigClass([], Array)) return false;
  if (!hasRustConfigClass(merger) || !ownData(merger)) return false;
  if (
    !hasRustConfigLogger(state.logger) ||
    !hasRustConfigConstructor(VariantPolicy) ||
    !hasRustConfigConstructor(ExtensionDataList)
  )
    return false;
  if (
    !isRustConfigJson(state.handledExtIds) ||
    state.handledExtIds.length !== 2 ||
    state.handledExtIds[0] !== BuilderAspect.id ||
    state.handledExtIds[1] !== EnvsAspect.id ||
    !Object.isExtensible(state.handledExtIds) ||
    !Object.getOwnPropertyDescriptor(state.handledExtIds, 'length')?.writable ||
    state.currentEnv ||
    state.otherEnv ||
    state.baseEnv
  )
    return false;
  for (const field of ['currentEnv', 'otherEnv', 'baseEnv']) {
    const property = Object.getOwnPropertyDescriptor(merger, field);
    if (property ? !('value' in property) || !property.writable : !Object.isExtensible(merger)) return false;
  }
  return true;
}
function projectLaneIds(laneIds: any): string[] | undefined {
  const result: string[] = [];

  if (!(hasRustConfigClass(laneIds, Array) || hasRustConfigClass(laneIds, ComponentIdList)) || !ownData(laneIds))
    return undefined;
  for (let index = 0; index < laneIds.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(laneIds, index) || typeof laneIds[index] !== 'string') return undefined;
    result.push(laneIds[index]);
  }
  return result;
}
function projectAspectData(data: any): { value: any; undefinedKeys: string[] } | undefined {
  if (isRustConfigJson(data)) return { value: data, undefinedKeys: [] };
  if (
    !data ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(data)) ||
    Object.getOwnPropertySymbols(data).length
  )
    return undefined;
  const values: Array<[string, any]> = [];
  const undefinedKeys: string[] = [];
  const properties = Object.entries(Object.getOwnPropertyDescriptors(data));
  if (properties.length > 4096) return undefined;
  for (const [key, property] of properties) {
    if (key.length > 4096) return undefined;
    if (!('value' in property) || !property.enumerable) return undefined;
    if (property.value === undefined) undefinedKeys.push(key);
    else if (isRustConfigJson(property.value)) values.push([key, property.value]);
    else return undefined;
  }
  return { value: Object.fromEntries(values), undefinedKeys: undefinedKeys.sort() };
}
function projectResolverData(value: any, seen = new Set<object>(), depth = 0): any {
  if (depth > 64) throw new Error('unsupported resolver data');
  if (isRustConfigJson(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length)
    throw new Error('unsupported resolver data');
  const array = Array.isArray(value);
  if (
    array
      ? Object.getPrototypeOf(value) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error('unsupported resolver data');
  const properties = Object.entries(Object.getOwnPropertyDescriptors(value));
  if (properties.length > 4097 || (array && properties.length !== value.length + 1))
    throw new Error('unsupported resolver data');
  if (array) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error('unsupported resolver data');
    }
  }
  seen.add(value);
  const entries: Array<[string, any]> = [];
  for (const [key, property] of properties) {
    if (array && key === 'length') continue;
    if (key.length > 4096 || !('value' in property) || !property.enumerable)
      throw new Error('unsupported resolver data');
    if (property.value === undefined) {
      if (array) throw new Error('unsupported resolver data');
      continue;
    }
    entries.push([key, projectResolverData(property.value, seen, depth + 1)]);
  }
  seen.delete(value);
  return array ? entries.map(([, entry]) => entry) : Object.fromEntries(entries);
}
function projectAspects(
  merger: ComponentConfigMerger,
  input: any,
  configs: Record<Side, any[]>,
  entries: Record<Side, ExtensionDataEntry[]>,
  retain: (value: any) => void
): boolean {
  for (const side of ['current', 'base', 'other'] as Side[]) {
    const list = (merger as any)[`${side}Aspects`];
    if (!hasRustConfigClass(list, ExtensionDataList) || !ownData(list)) return false;
    for (const entry of list) {
      if (
        !hasRustConfigClass(entry, ExtensionDataEntry) ||
        !Object.entries(Object.getOwnPropertyDescriptors(entry)).every(
          ([key, property]) => ['rawConfig', 'data'].includes(key) || 'value' in property
        )
      )
        return false;
      const componentId = entry.extensionId ? idProjection(entry.extensionId) : undefined;
      if (entry.extensionId && !componentId) return false;
      const stringId = entry.stringId;
      if (typeof stringId !== 'string' || typeof entry.idWithoutVersion !== 'string') return false;
      const skipped = stringId === BuilderAspect.id;
      if (!skipped && (!ownData(entry) || !isRustConfigJson(entry.rawConfig))) return false;
      let data;
      try {
        data = skipped
          ? { value: {}, undefinedKeys: [] }
          : stringId === DependencyResolverAspect.id
            ? { value: projectResolverData(entry.data), undefinedKeys: [] }
            : projectAspectData(entry.data);
      } catch {
        return false;
      }
      if (!data) return false;
      if (!skipped) {
        retain(entry.rawConfig);
        retain(entry.data);
      }
      const config = skipped ? {} : entry.rawConfig === '-' ? '-' : omit(entry.rawConfig, ['__specific']);
      if (['__proto__', 'constructor', 'prototype'].includes(stringId)) return false;
      input[side].push({
        stringId,
        idWithoutVersion: entry.idWithoutVersion,
        ...(componentId ? { componentId: { base: componentId.base, version: componentId.version } } : {}),
        ...(entry.name ? { name: entry.name } : {}),
        configJson: JSON.stringify(config),
        configPretty: JSON.stringify(config, undefined, 2),
        config,
        data: data.value,
        dataUndefinedKeys: data.undefinedKeys,
      });
      configs[side].push(config);
      entries[side].push(entry);
    }
  }
  return true;
}
function snapshot(merger: ComponentConfigMerger, shouldMergeAspectsData: boolean): Snapshot | undefined {
  if (!eligibleMerger(merger)) return undefined;
  const state = merger as any;
  const configs = { current: [], base: [], other: [] } as Record<Side, any[]>;
  const entries = { current: [], base: [], other: [] } as Record<Side, ExtensionDataEntry[]>;
  const references: object[] = [];
  const retain = (value: any) => {
    if (!value || typeof value !== 'object') return;
    references.push(value);
    Object.values(value).forEach(retain);
  };
  const input: any = {
    kind: 'configComponent',
    compIdStr: state.compIdStr,
    current: [],
    base: [],
    other: [],
    coreNames: [],
    workspaceIds: [],
    otherLaneIds: [],
    strategy: state.mergeStrategy,
    currentLabel: state.currentLabel,
    otherLabel: state.otherLabel,
    shouldMergeAspectsData,
  };
  const laneIds = projectLaneIds(state.otherLaneIdsStr);
  if (!laneIds) return undefined;
  input.otherLaneIds = laneIds;
  if (
    !isRustConfigJson(input.otherLaneIds) ||
    typeof input.compIdStr !== 'string' ||
    typeof input.currentLabel !== 'string' ||
    typeof input.otherLabel !== 'string'
  )
    return undefined;
  if (input.strategy !== undefined && !['ours', 'theirs', 'manual'].includes(input.strategy)) return undefined;
  const registry = ExtensionDataList.coreExtensionsNames;
  if (!hasRustConfigClass(registry, Map)) return undefined;
  input.coreNames = [...registry.keys()];
  if (!input.coreNames.every((name: unknown) => typeof name === 'string')) return undefined;
  if (
    !(hasRustConfigClass(state.workspaceIds, Array) || hasRustConfigClass(state.workspaceIds, ComponentIdList)) ||
    !ownData(state.workspaceIds)
  )
    return undefined;
  for (const id of state.workspaceIds) {
    const projection = idProjection(id, true);
    if (!projection) return undefined;
    input.workspaceIds.push(projection);
  }
  if (!projectAspects(merger, input, configs, entries, retain)) return undefined;
  const strings: string[] = [];
  if (Buffer.byteLength(JSON.stringify(input)) > 4 * 1024 * 1024) return undefined;
  const visit = (value: any) => {
    if (typeof value === 'string') strings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  for (const side of ['current', 'base', 'other'] as Side[]) {
    for (const entry of input[side]) {
      if (entry.componentId?.version) strings.push(entry.componentId.version);
      if (entry.stringId !== DependencyResolverAspect.id && entry.name !== DependencyResolverAspect.id) continue;
      visit(entry.config.policy);
      visit(entry.data?.policy);
      if (Array.isArray(entry.data?.dependencies)) {
        for (const dependency of entry.data.dependencies) {
          if (typeof dependency?.version === 'string') strings.push(dependency.version);
        }
      }
    }
  }
  const semver = normalizeSemverInputs(strings);
  if (!semver) return undefined;
  input.semver = semver;
  return { input, configs, entries, references, fingerprint: JSON.stringify(input) };
}

export async function tryRustComponentConfigMerge(
  merger: ComponentConfigMerger,
  shouldMergeAspectsData: boolean,
  inputsUnchanged: () => boolean = () => true
): Promise<
  { configMergeResult: ConfigMergeResult; dataMergeResult: { conflictedAspects?: Record<string, string> } } | undefined
> {
  if (!isRustConfigOperation()) return undefined;
  const before = snapshot(merger, shouldMergeAspectsData);
  if (!before) return undefined;
  const permittedIds = new Set<string>([
    ...before.input.current.map((entry: any) => entry.stringId),
    ...before.input.other.map((entry: any) => entry.stringId),
    ...before.input.workspaceIds.map((entry: any) => entry.legacy),
  ]);
  const configValid = (value: any) =>
    value === '-' || (value && typeof value === 'object' && !Array.isArray(value) && isRustConfigJson(value));
  const valueValid = (value: any): value is ConfigValue => {
    if (!value || !isRustConfigJson(value)) return false;
    if (Object.prototype.hasOwnProperty.call(value, 'value'))
      return Object.keys(value).length === 1 && configValid(value.value);
    const source = value.source;
    return (
      Object.keys(value).length === 1 &&
      source &&
      ['current', 'base', 'other'].includes(source.side) &&
      Number.isInteger(source.index) &&
      source.index >= 0 &&
      source.index < before.configs[source.side as Side].length
    );
  };
  const plan = await requestRustConfig<Plan>(before.input, (data) => {
    if (
      !isRustConfigJson(data) ||
      !Array.isArray(data.configRows) ||
      !Array.isArray(data.logs) ||
      !Array.isArray(data.dataAssignments) ||
      !Array.isArray(data.conflictedAspects)
    )
      return false;
    if (
      !data.state ||
      !Array.isArray(data.state.handledExtIds) ||
      !data.state.handledExtIds.every((id: unknown) => typeof id === 'string') ||
      data.state.handledExtIds.length > before.entries.current.length + before.entries.other.length + 4 ||
      data.state.handledExtIds[0] !== BuilderAspect.id ||
      data.state.handledExtIds[1] !== EnvsAspect.id ||
      !Array.isArray(data.state.envs) ||
      data.state.envs.length !== 3 ||
      !data.state.envs.every((env: any, index: number) => {
        const side = (['current', 'other', 'base'] as Side[])[index];
        if (typeof env.id !== 'string' || (env.version !== undefined && typeof env.version !== 'string')) return false;
        if (env.sourceIndex === undefined) return env.version === undefined;
        return (
          Number.isInteger(env.sourceIndex) &&
          env.sourceIndex >= 0 &&
          env.sourceIndex < before.entries[side].length &&
          before.input[side][env.sourceIndex].stringId !== BuilderAspect.id &&
          env.version === before.input[side][env.sourceIndex].componentId?.version
        );
      })
    )
      return false;
    if (
      data.configRows.length > before.entries.current.length + before.entries.other.length + 1 ||
      (!shouldMergeAspectsData && (data.dataAssignments.length || data.conflictedAspects.length))
    )
      return false;
    if (
      !data.logs.every(
        (log: any) =>
          ['debug', 'trace'].includes(log.level) &&
          typeof log.message === 'string' &&
          (log.meta === undefined || Array.isArray(log.meta)) &&
          (log.metaUndefined === undefined || log.metaUndefined === true)
      )
    )
      return false;
    if (
      !data.configRows.every(
        (row: any) =>
          typeof row.id === 'string' &&
          permittedIds.has(row.id) &&
          (row.deps === undefined || (row.deps === true && row.id === DependencyResolverAspect.id)) &&
          !['__proto__', 'constructor', 'prototype'].includes(row.id) &&
          (row.merged === undefined || valueValid(row.merged)) &&
          (row.conflict === undefined ||
            (row.conflict.kind === 'deps' && configValid(row.conflict.value) && row.conflict.value !== '-') ||
            (row.conflict.kind === 'basic' &&
              valueValid(row.conflict.current) &&
              valueValid(row.conflict.other) &&
              (row.conflict.baseOwn === undefined || row.conflict.baseOwn === true) &&
              (row.conflict.base === undefined || valueValid(row.conflict.base))))
      )
    )
      return false;
    const assigned = new Set<number>();
    let previousAssignment = -1;
    if (
      !data.dataAssignments.every(
        (assignment: any) =>
          Number.isInteger(assignment.current) &&
          assignment.current >= 0 &&
          assignment.current < before.entries.current.length &&
          !assigned.has(assignment.current) &&
          assignment.current > previousAssignment &&
          Number.isInteger(assignment.other) &&
          assignment.other >= 0 &&
          assignment.other < before.entries.other.length &&
          before.input.current[assignment.current].idWithoutVersion ===
            before.input.other[assignment.other].idWithoutVersion &&
          before.input.current[assignment.current].componentId?.version ===
            before.input.other[assignment.other].componentId?.version &&
          (assigned.add(assignment.current), (previousAssignment = assignment.current), true)
      )
    )
      return false;
    return data.conflictedAspects.every(
      (entry: any) =>
        typeof entry.id === 'string' &&
        typeof entry.reason === 'string' &&
        !['__proto__', 'constructor', 'prototype'].includes(entry.id)
    );
  });
  if (!plan) return undefined;
  const after = snapshot(merger, shouldMergeAspectsData);
  if (
    !inputsUnchanged() ||
    !after ||
    after.fingerprint !== before.fingerprint ||
    after.references.length !== before.references.length ||
    after.references.some((value, index) => value !== before.references[index]) ||
    (['current', 'base', 'other'] as Side[]).some((side) =>
      after.entries[side].some((entry, index) => entry !== before.entries[side][index])
    )
  )
    return undefined;
  const state = merger as any;
  state.handledExtIds.push(...plan.state.handledExtIds.slice(state.handledExtIds.length));
  for (const [index, side] of (['current', 'other', 'base'] as Side[]).entries()) {
    const env = plan.state.envs[index];
    state[`${side}Env`] = {
      id: env.id,
      ...(env.sourceIndex === undefined ? {} : { version: env.version, config: before.configs[side][env.sourceIndex] }),
    };
  }
  for (const log of plan.logs) {
    if (log.metaUndefined) state.logger[log.level](log.message, undefined);
    else state.logger[log.level](log.message, ...(log.meta || []));
  }
  const decode = (value: ConfigValue) =>
    'source' in value ? before.configs[value.source.side][value.source.index] : value.value;
  const results: MergeStrategyResult[] = plan.configRows.map((row) => ({
    id: row.id,
    ...(row.merged ? { mergedConfig: decode(row.merged) } : row.deps ? { mergedConfig: undefined } : {}),
    ...(row.conflict
      ? {
          conflict:
            row.conflict.kind === 'deps'
              ? row.conflict.value
              : {
                  currentConfig: decode(row.conflict.current),
                  otherConfig: decode(row.conflict.other),
                  ...(row.conflict.base
                    ? { baseConfig: decode(row.conflict.base) }
                    : row.conflict.baseOwn
                      ? { baseConfig: undefined }
                      : {}),
                },
        }
      : row.deps
        ? { conflict: undefined }
        : {}),
  }));
  for (const assignment of plan.dataAssignments)
    before.entries.current[assignment.current].data = before.entries.other[assignment.other].data;
  const conflictedAspects: Record<string, string> = {};
  for (const entry of plan.conflictedAspects) conflictedAspects[entry.id] = entry.reason;
  return {
    configMergeResult: new ConfigMergeResult(state.compIdStr, state.currentLabel, state.otherLabel, results),
    dataMergeResult: shouldMergeAspectsData ? { conflictedAspects } : {},
  };
}
