import type defaultIgnore from 'ignore';
import { isFeatureEnabled, NO_FS_CACHE_FEATURE } from '@teambit/harmony.modules.feature-toggle';
import { FsCache, dependencyCacheNeedsInvalidation } from '@teambit/workspace.modules.fs-cache';
import path from 'path';
import { availableParallelism } from 'os';
import { createRequire } from 'module';
import { ALWAYS_IGNORE_LIST, IGNORE_LIST, IGNORE_ROOT_ONLY_LIST } from '@teambit/legacy.constants';
import {
  resolveRustObjectImportExecutable,
  resolveRustWorkspaceAddon,
} from '@teambit/objects/dist/objects/rust-object-discovery.js';
import { captureRustInventoryPolicy } from '@teambit/legacy.bit-map/dist/rust-inventory-policy.js';
import { rebaseIgnorePattern } from '@teambit/legacy.bit-map/dist/ignore-pattern.js';
import { currentStatusMetadata, fullIdentity, statusPolicy } from './rust-status-policy';

type Engine = { request: (frame: Buffer) => Promise<Buffer>; close: () => void };
const bitmapRequire = createRequire(require.resolve('@teambit/legacy.bit-map'));
const ignore = bitmapRequire('ignore') as typeof defaultIgnore;

export type NativeClientRequest = (input: object) => Promise<any>;

export async function withRustClientRequest<T>(
  read: (request: NativeClientRequest) => Promise<T>
): Promise<T | undefined> {
  const executable = resolveRustObjectImportExecutable();
  const addon = executable && resolveRustWorkspaceAddon(executable);
  if (!addon) return undefined;
  let engine: Engine | undefined;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const binding = require(addon) as { WorkspaceEngine: new (threads: number) => Engine };
    engine = new binding.WorkspaceEngine(Math.min(4, availableParallelism()));
    let id = 0;
    const request: NativeClientRequest = async (input) => {
      const body = Buffer.from(JSON.stringify(input));
      if (body.length > 4 * 1024 * 1024) throw new Error('status input limit');
      const header = Buffer.alloc(12);
      header.write('BWS1');
      header.writeUInt32BE(++id, 4);
      header.writeUInt32BE(body.length, 8);
      const bytes = await engine!.request(Buffer.concat([header, body]));
      if (bytes.length > 32 * 1024 * 1024) throw new Error('status output limit');
      const response = JSON.parse(bytes.toString());
      if (response.version !== 1 || response.id !== id || response.failed || response.skipped?.length)
        throw new Error('status native request declined');
      return response.data;
    };
    return await read(request);
  } catch {
    return undefined;
  } finally {
    engine?.close();
  }
}

export async function captureRustClientCurrent(
  root: string,
  context: any,
  request: NativeClientRequest,
  targets = context.targets
) {
  if (isFeatureEnabled(NO_FS_CACHE_FEATURE)) return undefined;
  const cache = new FsCache(path.join(root, '.bit'));
  if (await dependencyCacheNeedsInvalidation(cache, root, path.join(root, 'workspace.jsonc'))) return undefined;
  const { options } = context;
  const rootIgnore = ignore().add([
    ...options.patterns,
    ...(options.trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST),
    ...options.ignoredFiles,
  ]);
  const rootPolicy = captureRustInventoryPolicy(rootIgnore);
  if (!rootPolicy) return undefined;
  const compile = (patterns: string[]) => {
    const value = captureRustInventoryPolicy(ignore().add(patterns));
    if (!value) throw new Error('status ignore compiler');
    return value.policy;
  };
  const comparisons: any[] = [];
  const captured: any[] = [];
  const components: any[] = [];
  for (const target of targets) {
    const policy = statusPolicy(context, target);
    const componentRoot = path.join(root, target.directory);
    const scan = await request({
      kind: 'inventoryBegin',
      root: componentRoot,
      workspace: root,
      excludeDirs:
        target.directory === '.'
          ? context.targets.filter((row) => row.directory !== '.').map((row) => path.join(root, row.directory))
          : [],
      rootPolicy: rootPolicy.policy,
    });
    const patterns = scan.nested.flatMap((row) =>
      row.patterns.map((pattern) => rebaseIgnorePattern(pattern, row.directory))
    );
    const combined = captureRustInventoryPolicy(ignore().add(rootIgnore).add(patterns));
    if (!combined || !rootPolicy.fresh()) return undefined;
    const manifest = await request({
      kind: 'inventoryFinish',
      token: scan.token,
      combined: combined.policy,
      hard: compile(options.trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST),
      own: compile(scan.own),
      ignoredRoot: options.trackAllFiles ? [] : IGNORE_ROOT_ONLY_LIST,
    });
    const files = manifest.files.map((file) => file.relativePath);
    if (!files.includes(target.mainFile)) return undefined;
    const dependencies = await request({
      kind: 'dependencyPolicyCached',
      root,
      componentRoot,
      identity: fullIdentity(target),
      files: files.map((file) => path.join(componentRoot, file)),
      ...policy.input,
    });
    const current = currentStatusMetadata(target, policy, dependencies);
    const entry = {
      identity: target.identity,
      version: target.version,
      directory: target.directory,
      files,
      current,
    };
    captured.push({
      ...entry,
      peerDependencies: dependencies.state.components[2].map((index) => dependencies.state.entries[index].identity),
    });
    if (target.version) comparisons.push(entry);
    components.push({
      identity: fullIdentity(target),
      packageName: policy.packageName,
      dependencies: dependencies.state.components.flatMap((indices) =>
        indices.map((index) => dependencies.state.entries[index].identity)
      ),
      issues: dependencies.issues,
    });
  }
  return { comparisons, captured, components, fresh: () => rootPolicy.fresh() };
}
