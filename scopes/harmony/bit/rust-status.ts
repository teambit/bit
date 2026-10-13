import type defaultIgnore from 'ignore';
import fs from 'fs';
import path from 'path';
import { availableParallelism, homedir } from 'os';
import { createRequire } from 'module';
import { ALWAYS_IGNORE_LIST, IGNORE_LIST, IGNORE_ROOT_ONLY_LIST } from '@teambit/legacy.constants';
import {
  resolveRustObjectImportExecutable,
  resolveRustWorkspaceAddon,
} from '@teambit/objects/dist/objects/rust-object-discovery.js';
import { captureRustInventoryPolicy } from '@teambit/legacy.bit-map/dist/rust-inventory-policy.js';
import { rebaseIgnorePattern } from '@teambit/legacy.bit-map/dist/ignore-pattern.js';
import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { collectRustStatusIssues } from './rust-status-issues';
import { currentStatusMetadata, fullIdentity, statusPolicy } from './rust-status-policy';

type Engine = { request: (frame: Buffer) => Promise<Buffer>; close: () => void };
const bitmapRequire = createRequire(require.resolve('@teambit/legacy.bit-map'));
const ignore = bitmapRequire('ignore') as typeof defaultIgnore;

/** A fresh, read-only command owns the complete native state before publishing JSON. */
export async function readRustStatus(root: string, home: string): Promise<any | undefined> {
  const executable = resolveRustObjectImportExecutable();
  const addon = executable && resolveRustWorkspaceAddon(executable);
  if (!addon) return undefined;
  let engine: Engine | undefined;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const binding = require(addon) as { WorkspaceEngine: new (threads: number) => Engine };
    engine = new binding.WorkspaceEngine(Math.min(4, availableParallelism()));
    let id = 0;
    const request = async (input: object) => {
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
    const context = await request({ kind: 'statusContext', root, home });
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
    const components: any[] = [];
    for (const target of context.targets) {
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
      if (target.version)
        comparisons.push({
          identity: target.identity,
          version: target.version,
          directory: target.directory,
          files,
          current,
        });
      components.push({
        identity: fullIdentity(target),
        packageName: policy.packageName,
        dependencies: dependencies.state.components.flatMap((indices) =>
          indices.map((index) => dependencies.state.entries[index].identity)
        ),
        issues: dependencies.issues,
      });
    }
    const compared = await request({ kind: 'statusCompare', root, targets: comparisons });
    const issues = await collectRustStatusIssues(root, context, components);
    if (!issues || !rootPolicy.fresh()) return undefined;
    const targets = context.targets.map((target, index) => ({
      identity: target.identity,
      version: target.version,
      modified: compared.comparisons.find((row) => row.identity === target.identity)?.modified ?? false,
      dependencies: components[index].dependencies,
      issues: issues.find((row) => row.id === target.identity)?.issues ?? [],
    }));
    const versions = [
      ...targets.map((target) => target.version),
      ...components.flatMap((component) => component.dependencies.map((dep) => dep.split('@')[1] ?? '')),
      ...context.models.flatMap((model) => [
        ...Object.keys(model.versions ?? {}),
        ...Object.keys(model.orphanedVersions ?? {}),
        model.head ?? '',
      ]),
      ...context.histories.map((history) => history.remoteHead ?? ''),
    ];
    const semver = snapshotSemverGrammar(versions);
    if (!semver) return undefined;
    const result = await request({
      kind: 'statusResult',
      currentLaneId: `${context.scope.name}/main`,
      targets,
      models: context.models,
      histories: context.histories,
      semver,
    });
    for (const [key, rows] of Object.entries(result)) {
      if (Array.isArray(rows) && key !== 'importPendingComponents')
        rows.sort((a, b) => (typeof a === 'string' ? a : a.id).localeCompare(typeof b === 'string' ? b : b.id));
    }
    return result;
  } catch {
    return undefined;
  } finally {
    engine?.close();
  }
}

export async function runRustStatus(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['status', 's'].includes(args[0]) || !['--json', '-j'].includes(args[1])) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  const result = await readRustStatus(root, homedir());
  if (!result) return false;
  const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
  const { logger } = await import('@teambit/legacy.logger');
  const { Slot } = await import('@teambit/harmony');
  logger.writeCommandHistoryStart();
  const runner = new CommandRunner(
    { name: 'status', description: '', loader: true, json: async () => result },
    [],
    { json: true },
    Slot.withType<any>()(() => 'teambit.harmony/bit')
  );
  await runner.runCommand();
  return true;
}
