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

type Engine = { request: (frame: Buffer) => Promise<Buffer>; close: () => void };
type Summary = { modified: string[]; newComps: string[]; compWithIssues: [] };
const bitmapRequire = createRequire(require.resolve('@teambit/legacy.bit-map'));
const ignore = bitmapRequire('ignore') as typeof defaultIgnore;

/** Only a fresh CLI without configured extensions may own the entire read in Rust. */
export async function readRustMiniStatus(root: string, home: string): Promise<Summary | undefined> {
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
    const plan = await request({ kind: 'statusPrepare', root, home });
    if (!Number.isSafeInteger(plan.count) || plan.count < 0 || plan.count > 4096) return undefined;
    const rootIgnore = ignore().add([
      ...plan.patterns,
      ...(plan.trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST),
      ...plan.ignoredFiles,
    ]);
    const rootPolicy = captureRustInventoryPolicy(rootIgnore);
    if (!rootPolicy) return undefined;
    const policy = (patterns: string[]) => {
      const captured = captureRustInventoryPolicy(ignore().add(patterns));
      if (!captured) throw new Error('status custom ignore compiler');
      return captured.policy;
    };
    for (let index = 0; index < plan.count; index++) {
      const scan = await request({ kind: 'statusScan', rootPolicy: rootPolicy.policy });
      const patterns = scan.nested.flatMap((row: { directory: string; patterns: string[] }) =>
        row.patterns.map((pattern) => rebaseIgnorePattern(pattern, row.directory))
      );
      const combined = captureRustInventoryPolicy(ignore().add(rootIgnore).add(patterns));
      if (!combined || !rootPolicy.fresh()) return undefined;
      await request({
        kind: 'statusFinish',
        token: scan.token,
        combined: combined.policy,
        hard: policy(plan.trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST),
        own: policy(scan.own),
        ignoredRoot: plan.trackAllFiles ? [] : IGNORE_ROOT_ONLY_LIST,
      });
    }
    const result = await request({ kind: 'statusComplete' });
    if (!rootPolicy.fresh() || !validSummary(result, plan.count)) return undefined;
    return result;
  } catch {
    // No public model aliases, writes or output exist before complete succeeds.
    return undefined;
  } finally {
    engine?.close();
  }
}

function validSummary(value: any, count: number): value is Summary {
  return (
    value &&
    [value.modified, value.newComps].every(
      (ids) =>
        Array.isArray(ids) && ids.length <= count && ids.every((id) => typeof id === 'string' && id.length <= 2049)
    ) &&
    Array.isArray(value.compWithIssues) &&
    value.compWithIssues.length === 0
  );
}

export async function runRustMiniStatus(): Promise<boolean> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['mini-status', 'ms'].includes(args[0]) || !['--json', '-j'].includes(args[1]))
    return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  const result = await readRustMiniStatus(root, homedir());
  if (!result) return false;
  const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
  const { logger } = await import('@teambit/legacy.logger');
  const { Slot } = await import('@teambit/harmony');
  logger.writeCommandHistoryStart();
  const runner = new CommandRunner(
    { name: 'mini-status [component-pattern]', description: '', loader: true, json: async () => result },
    [],
    { json: true },
    Slot.withType<any>()(() => 'teambit.harmony/bit')
  );
  await runner.runCommand();
  return true;
}
