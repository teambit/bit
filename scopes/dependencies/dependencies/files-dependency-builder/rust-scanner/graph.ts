import path from 'path';
import { DetectorHook } from '@teambit/dependency-resolver';
import { homedir } from 'os';
import { builtinModules } from 'module';
import * as treeModule from '../dependency-tree';
import precinct, { isRustGraphEligible, rustGraphDetectorExtensions } from '../precinct';
import { canUseRustCommonJS, registerRustCommonJSPath, rustDependencyResolutionMode } from '../filing-cabinet';
import type { RustDependencyScannerSession } from './session';
import type { RustDependencyGraph, RustDependencyGraphRequest, RustGraphPathMap, RustGraphVisited } from './types';

const originalTree = treeModule.default;
const originalDependencies = (treeModule as any)._getDependencies;
const originalPaperwork = precinct.paperwork;
const builtins = [
  ...new Set(builtinModules.flatMap((name) => (name.startsWith('node:') ? [name] : [name, `node:${name}`]))),
];
const maximum = 1024 * 1024;

function record(value: any): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}
function plainData(value: any, budget = { bytes: maximum }, depth = 0): boolean {
  if (depth > 16 || budget.bytes < 0) return false;
  if (value === undefined || value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    budget.bytes -= Buffer.byteLength(value) + 8;
    return budget.bytes >= 0;
  }
  if (!record(value) && !(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    budget.bytes -= Buffer.byteLength(key) + 16;
    if (!('value' in descriptor) || !plainData(descriptor.value, budget, depth + 1)) return false;
  }
  return budget.bytes >= 0;
}
function absolute(value: any): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 32768 &&
    !value.includes('\0') &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
}
function strings(value: any): value is string[] {
  return Array.isArray(value) && value.length <= 65536 && value.every((item) => typeof item === 'string');
}
function pathMap(value: any): value is RustGraphPathMap {
  return (
    record(value) &&
    absolute(value.file) &&
    Array.isArray(value.dependencies) &&
    value.dependencies.length <= 4096 &&
    value.dependencies.every(
      (dependency) =>
        record(dependency) && typeof dependency.importSource === 'string' && absolute(dependency.resolvedDep)
    )
  );
}
function writable(object: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor ? 'value' in descriptor && Boolean(descriptor.writable) : Object.isExtensible(object);
}
function eligible(filename: string, config: any): boolean {
  return (
    isRustGraphEligible(filename, { ...config.detectiveOptions, envDetectors: config.envDetectors }) &&
    (!rustGraphDetectorExtensions.includes(path.extname(filename)) || canUseRustCommonJS(filename, config, true))
  );
}
function input(files: string[], config: any): RustDependencyGraphRequest | undefined {
  if (
    !record(config) ||
    Reflect.ownKeys(config).some((key) => !('value' in Object.getOwnPropertyDescriptor(config, key)!))
  )
    return undefined;
  if (!absolute(config.baseDir) || files.length > 4096 || !files.every(absolute) || config.dependencyFilter)
    return undefined;
  if (
    treeModule.default !== originalTree ||
    (treeModule as any)._getDependencies !== originalDependencies ||
    precinct.paperwork !== originalPaperwork
  )
    return undefined;
  if (!canUseRustCommonJS(path.join(config.baseDir, '__native_graph__.js'), config, true)) return undefined;
  if (Object.getOwnPropertyDescriptor(precinct, 'ast')?.configurable === false) return undefined;
  if (
    config.detectiveOptions !== undefined &&
    (!plainData(config.detectiveOptions) ||
      !record(config.detectiveOptions) ||
      !['includeCore', 'envDetectors'].every((key) => writable(config.detectiveOptions, key)))
  )
    return undefined;
  if (!files.every((file) => eligible(file, config))) return undefined;
  const visited = config.visited;
  if (
    visited !== undefined &&
    (!record(visited) ||
      !Object.isExtensible(visited) ||
      !plainData(visited) ||
      Object.entries(visited).some(
        ([file, row]: [string, any]) =>
          !absolute(file) ||
          !pathMap(row?.pathMap) ||
          row.pathMap.file !== file ||
          row.error != null ||
          (row.missing !== undefined && !strings(row.missing))
      ))
  )
    return undefined;
  const request: RustDependencyGraphRequest = {
    root: config.baseDir,
    files: [...files],
    home: homedir(),
    builtins,
    includeNpm: Boolean(config.includeNpm),
    typescript: rustDependencyResolutionMode(path.join(config.baseDir, '__native_graph__.ts')) === 'typescript5.9',
    detectorExtensions: [...rustGraphDetectorExtensions],
    ...(visited === undefined ? {} : { visited }),
  };
  return plainData(request) ? request : undefined;
}
function valid(result: RustDependencyGraph, config: any): boolean {
  if (
    !plainData(result, { bytes: 32 * maximum }) ||
    !record(result.tree) ||
    !record(result.missing) ||
    !record(result.errors) ||
    Object.keys(result.errors).length ||
    !record(result.visited) ||
    !Array.isArray(result.pathMap) ||
    result.pathMap.length > 65536 ||
    !result.pathMap.every(pathMap) ||
    !Array.isArray(result.pathMapOrigins) ||
    result.pathMapOrigins.length !== result.pathMap.length ||
    !strings(result.scannedPaths) ||
    !result.scannedPaths.every((file) => absolute(file) && Object.hasOwn(result.visited, file)) ||
    !strings(result.registeredPaths) ||
    !result.registeredPaths.every(absolute)
  )
    return false;
  if (!Object.entries(result.tree).every(([file, edges]) => absolute(file) && strings(edges) && edges.every(absolute)))
    return false;
  if (!Object.entries(result.missing).every(([file, missing]) => absolute(file) && strings(missing))) return false;
  if (
    !Object.entries(result.visited).every(
      ([file, row]) => absolute(file) && pathMap(row.pathMap) && row.pathMap.file === file
    )
  )
    return false;
  if (
    !result.pathMap.every((row, index) => {
      const origin = result.pathMapOrigins[index];
      return (
        Number.isSafeInteger(origin) &&
        origin >= 0 &&
        origin <= index &&
        result.pathMapOrigins[origin] === origin &&
        JSON.stringify(row) === JSON.stringify(result.pathMap[origin]) &&
        eligible(row.file, config)
      );
    })
  )
    return false;
  const files = new Set(result.pathMap.map((row) => row.file));
  if (files.size !== Object.keys(result.tree).length || [...files].some((file) => !Object.hasOwn(result.tree, file)))
    return false;
  if (Object.keys(result.visited).some((file) => !files.has(file) || config.visited?.[file])) return false;
  if (
    Object.entries(result.missing).some(
      ([file, missing]) =>
        !config.visited?.[file]?.missing || JSON.stringify(missing) !== JSON.stringify(config.visited[file].missing)
    )
  )
    return false;
  return result.registeredPaths.every((file) => Object.hasOwn(result.visited, file) && eligible(file, config));
}

/** Commit canonical aliases and lookup side effects only after the complete native graph succeeds. */
export async function tryRustDependencyGraph(
  files: string[],
  config: any,
  session: RustDependencyScannerSession
): Promise<RustDependencyGraph | undefined> {
  if (!files.length) return undefined;
  const request = input(files, config);
  if (!request || files.every((file) => config.visited?.[file])) return undefined;
  const hooks = DetectorHook.hooks.slice();
  const hookStates = hooks.map((hook) => ({
    extensions: Object.getOwnPropertyDescriptor(hook, 'supportedExtensions')?.value,
    state: JSON.stringify([
      Object.getOwnPropertyDescriptor(hook, 'supportedExtensions')?.value,
      Object.getOwnPropertyDescriptor(hook, 'currentFilename'),
    ]),
  }));
  const before = JSON.stringify(request);
  const visited = config.visited;
  const options = config.detectiveOptions;
  const identities = Object.entries(visited ?? {}).map(([file, row]: [string, any]) => [
    file,
    row,
    row.pathMap,
    row.missing,
  ]);
  const result = await session.dependencyGraph(request);
  const after = input(files, config);
  if (
    hooks.length !== DetectorHook.hooks.length ||
    hooks.some(
      (hook, index) =>
        hook !== DetectorHook.hooks[index] ||
        Object.getOwnPropertyDescriptor(hook, 'supportedExtensions')?.value !== hookStates[index].extensions ||
        JSON.stringify([
          Object.getOwnPropertyDescriptor(hook, 'supportedExtensions')?.value,
          Object.getOwnPropertyDescriptor(hook, 'currentFilename'),
        ]) !== hookStates[index].state
    ) ||
    !result ||
    !after ||
    !valid(result, config) ||
    JSON.stringify(after) !== before ||
    config.visited !== visited ||
    config.detectiveOptions !== options ||
    identities.some(
      ([file, row, paths, missing]) => visited[file] !== row || row.pathMap !== paths || row.missing !== missing
    )
  )
    return undefined;
  const maps = result.pathMap.map((row, index, rows) => {
    const original = visited?.[row.file]?.pathMap;
    return original ?? rows[result.pathMapOrigins[index]];
  });
  const added: Record<string, RustGraphVisited> = {};
  for (const [file, row] of Object.entries(result.visited)) {
    if (visited?.[file]) return undefined;
    const map = maps.find((entry) => entry.file === file);
    if (!map || JSON.stringify(map) !== JSON.stringify(row.pathMap)) return undefined;
    added[file] = { pathMap: map, missing: undefined, error: undefined };
  }
  for (const file of Object.keys(result.missing)) {
    if (visited?.[file]?.missing) result.missing[file] = visited[file].missing;
  }
  if (Object.keys(added).length) {
    if (options) {
      options.includeCore = false;
      options.envDetectors = config.envDetectors;
    }
    delete (precinct as any).ast;
  }
  DetectorHook.replayNativeGraphHooks(result.scannedPaths.at(-1));
  result.registeredPaths.forEach(registerRustCommonJSPath);
  if (visited) Object.assign(visited, added);
  return { ...result, pathMap: maps, visited: added };
}
