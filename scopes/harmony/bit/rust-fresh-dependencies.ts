import path from 'path';
import { FsCache, dependencyCacheNeedsInvalidation } from '@teambit/workspace.modules.fs-cache';
import { builtinModules, createRequire } from 'module';
import { homedir } from 'os';
import { matchPatterns, splitPatterns } from '@teambit/toolbox.path.match-patterns';
import { defaultTestPatterns } from '@teambit/tester/dist/default-dev-patterns.js';
import { defaultDocsPatterns } from '@teambit/docs/dist/default-dev-patterns.js';
import { defaultCompositionsPatterns } from '@teambit/compositions/dist/default-dev-patterns.js';
import { rustGraphDetectorExtensions } from '@teambit/dependencies/dist/files-dependency-builder/precinct/index.js';
import { getCoreAspectPackageName } from '@teambit/aspect-loader/dist/core-aspects.js';
import { getAllCoreAspectsIds } from './manifests';
import { dependencyGrammar, fullIdentity } from './rust-status-policy';
import type { NativeClientRequest } from './rust-client-capture';

const lookupRequire = createRequire(require.resolve('@teambit/typescript.deps-lookups.lookup-typescript'));
const builtinNames = [
  ...new Set(builtinModules.flatMap((name) => (name.startsWith('node:') ? [name] : [name, `node:${name}`]))),
];

export function nativeDependencyGrammar() {
  return {
    builtins: builtinNames,
    detectorExtensions: [...rustGraphDetectorExtensions, '.jsonc'],
    typescript: lookupRequire('typescript/package.json').version === '5.9.2',
  };
}

export type FreshDependencyCachePlan = { cache: FsCache; reset: boolean };

export async function planFreshDependencyCache(root: string): Promise<FreshDependencyCachePlan> {
  const cache = new FsCache(path.join(root, '.bit'));
  return { cache, reset: await dependencyCacheNeedsInvalidation(cache, root, path.join(root, 'workspace.jsonc')) };
}

export type FreshDependencyCache = { identity: string; rawData: string; cacheable: boolean; readSet: any[] };

export function freshDependencyDetection(context: any, files: string[], policy: any) {
  const patterns = [defaultTestPatterns(), defaultDocsPatterns(), defaultCompositionsPatterns()].map(splitPatterns);
  const devFiles = files.filter((file) =>
    patterns.some(({ includePatterns, excludePatterns }) => matchPatterns(file, includePatterns, excludePatterns))
  );
  return {
    graph: { home: homedir(), ...nativeDependencyGrammar() },
    devFiles,
    modelPackages: policy.modelPackages,
    workspacePolicy: ['dependencies', 'devDependencies', 'peerDependencies'].map(
      (field) => policy.input.policies.workspacePolicy[field] ?? {}
    ),
    corePackages: getAllCoreAspectsIds().map(getCoreAspectPackageName),
    workspaceComponents: context.targets.map(fullIdentity),
  };
}

/** Only the built-in Node environment and unconfigured core slots reach this boundary. */
export async function readFreshDependencies(
  root: string,
  context: any,
  target: any,
  files: string[],
  policy: any,
  request: NativeClientRequest
): Promise<{ dependencies: any; cache: FreshDependencyCache }> {
  const componentRoot = path.join(root, target.directory);
  const capture = await request({
    kind: 'dependencyDetectFresh',
    root,
    componentRoot,
    identity: fullIdentity(target),
    files: files.map((file) => path.join(componentRoot, file)),
    detection: freshDependencyDetection(context, files, policy),
  });
  const { grammarInputs, ...receipt } = capture;
  const dependencies = await request({
    kind: 'dependencyPolicyDetected',
    root,
    componentRoot,
    capture: receipt,
    ...policy.input,
    resolution: { ...policy.input.resolution, grammar: dependencyGrammar([policy.input, grammarInputs]) },
  });
  if (
    typeof dependencies.rawData !== 'string' ||
    typeof dependencies.cacheable !== 'boolean' ||
    !Array.isArray(capture.readSet)
  )
    throw new Error('status fresh dependency cache receipt');
  return {
    dependencies,
    cache: {
      identity: fullIdentity(target),
      rawData: dependencies.rawData,
      cacheable: dependencies.cacheable,
      readSet: capture.readSet,
    },
  };
}

/** Delay canonical cache writes until the whole cold command is validated. */
export async function commitFreshDependencies(
  plan: FreshDependencyCachePlan,
  pending: FreshDependencyCache[],
  request: NativeClientRequest
): Promise<void> {
  for (const entry of pending) {
    const validation = await request({ kind: 'dependencyFreshValidate', readSet: entry.readSet });
    if (validation.fresh !== true) throw new Error('status fresh dependencies changed');
  }
  if (plan.reset) await plan.cache.deleteAllDependenciesDataCache();
  for (const entry of pending) {
    if (entry.cacheable) await plan.cache.saveDependenciesDataInCache(entry.identity, entry.rawData);
  }
}
