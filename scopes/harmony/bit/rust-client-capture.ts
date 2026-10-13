import type defaultIgnore from 'ignore';
import { isFeatureEnabled, NO_FS_CACHE_FEATURE } from '@teambit/harmony.modules.feature-toggle';
import type { FreshDependencyCache } from './rust-fresh-dependencies';
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
  read: (request: NativeClientRequest) => Promise<T>,
  mustPropagateError: () => boolean = () => false
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
  } catch (error) {
    if (mustPropagateError()) throw error;
    return undefined;
  } finally {
    engine?.close();
  }
}

export async function captureRustClientCurrent(
  root: string,
  context: any,
  request: NativeClientRequest,
  targets = context.targets,
  captureOptions: { verifyFreshDependencies?: boolean } = {}
) {
  if (isFeatureEnabled(NO_FS_CACHE_FEATURE)) return undefined;
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
  const pending: FreshDependencyCache[] = [];
  const cachePlan = targets.length
    ? await (await import('./rust-fresh-dependencies')).planFreshDependencyCache(root)
    : undefined;
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
    let dependencies =
      cachePlan?.reset && target.directory !== '.'
        ? { needsDetection: true }
        : await request({
            kind: 'dependencyPolicyCached',
            root,
            componentRoot,
            identity: fullIdentity(target),
            files: files.map((file) => path.join(componentRoot, file)),
            ...policy.input,
          });
    if (dependencies.needsDetection === true) {
      const { readFreshDependencies } = await import('./rust-fresh-dependencies');
      const fresh = await readFreshDependencies(root, context, target, files, policy, request);
      dependencies = fresh.dependencies;
      pending.push(fresh.cache);
    }
    if (
      captureOptions.verifyFreshDependencies &&
      dependencies.needsDetection !== true &&
      !pending.some((row) => row.identity === fullIdentity(target))
    ) {
      const { readFreshDependencies } = await import('./rust-fresh-dependencies');
      const fresh = await readFreshDependencies(root, context, target, files, policy, request);
      if (
        JSON.stringify(currentStatusMetadata(target, policy, fresh.dependencies)) !==
          JSON.stringify(currentStatusMetadata(target, policy, dependencies)) ||
        JSON.stringify(fresh.dependencies.issues) !== JSON.stringify(dependencies.issues)
      )
        return undefined;
      pending.push(fresh.cache);
    }
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
  return {
    comparisons,
    dependencyReadSet: pending.flatMap((entry) => entry.readSet),
    captured,
    components,
    fresh: () => rootPolicy.fresh(),
    commit: async () => {
      if (!rootPolicy.fresh()) throw new Error('status inventory policy changed');
      const plans = context.pendingHistory ?? [];
      if (!Array.isArray(plans)) throw new Error('status history plans');
      if (plans.length) {
        const validated = await request({ kind: 'statusHistoryValidate', root, plans });
        if (validated.fresh !== true) throw new Error('status history changed');
      }
      if (cachePlan && (pending.length || cachePlan.reset)) {
        const { commitFreshDependencies } = await import('./rust-fresh-dependencies');
        await commitFreshDependencies(cachePlan, pending, request);
      }
      if (plans.length) {
        const committed = await request({ kind: 'statusHistoryCommit', root, plans });
        if (!Number.isSafeInteger(committed.written) || committed.written < 0 || committed.written > plans.length)
          throw new Error('status history commit receipt');
      }
    },
  };
}
