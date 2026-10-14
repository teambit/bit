import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { homedir } from 'os';
import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import { GLOBAL_CONFIG, GLOBAL_REMOTES } from '@teambit/legacy.constants';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { loader } from '@teambit/legacy.loader';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { withRustClientRequest } from './rust-client-capture';
import { parseRustWorkspaceOutbound, type RustWorkspaceOutboundOptions } from './rust-workspace-outbound-options';
import { formatRustWorkspaceOutbound, validateRustOutboundReceipt } from './rust-workspace-outbound-report';

/** Rust selects, transfers, and publishes objects; Node handles only the public report. */
export async function readRustWorkspaceOutbound(
  root: string,
  home: string,
  options: RustWorkspaceOutboundOptions,
  beforeCommit?: () => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      const clientId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      const prepared = await request({
        kind: 'commandOutboundPrepare',
        root,
        home,
        globalRemotesFile: path.join(GLOBAL_CONFIG, GLOBAL_REMOTES),
        globalConfigDir: GLOBAL_CONFIG,
        nodeExecutable: process.execPath,
        bitDir: __dirname,
        bitVersion: getBitVersion(),
        bitmapHistoryFileId: currentDateAndTimeToFileName(),
        clientId,
        exportDate: Date.now().toString(),
        operation: 'export',
        ids: options.ids,
        options: { originDirectly: options.originDirectly },
      });
      if (
        !prepared ||
        prepared.owner !== 'rust' ||
        typeof prepared.token !== 'string' ||
        !prepared.token ||
        typeof prepared.nothingToExport !== 'boolean' ||
        typeof prepared.fileRemote !== 'boolean' ||
        !Array.isArray(prepared.scopes) ||
        prepared.scopes.some((scope: unknown) => typeof scope !== 'string' || !scope)
      )
        throw new Error('native outbound prepare receipt');
      if (prepared.fileRemote) {
        const { ExportPersist } = await import('@teambit/scope.remote-actions');
        if (ExportPersist.onPutHook) return undefined;
      }
      await beforeCommit?.();
      committing = true;
      let applied;
      try {
        applied = await request({ kind: 'commandOutboundApply', token: prepared.token });
      } catch (error) {
        const message = (error as Error).message;
        if (message.startsWith('outbound validate failed: ')) {
          loader.start('verifying that objects can be merged on the remotes...');
          throw new Error(message.slice('outbound validate failed: '.length));
        }
        const persist = /^outbound persist failed: ([^:]+): ([\s\S]*)$/.exec(message);
        if (persist) {
          loader.start('verifying that objects can be merged on the remotes...');
          for (const scope of prepared.scopes) {
            loader.start(`persisting data on the remote "${scope}"...`);
            if (scope === persist[1]) break;
          }
          const { PersistFailed } = await import('@teambit/legacy.scope');
          throw new PersistFailed([persist[1]], { [persist[1]]: persist[2] });
        }
        throw error;
      }
      if (
        !applied ||
        applied.token !== prepared.token ||
        applied.owner !== 'rust' ||
        typeof applied.pending !== 'boolean'
      )
        throw new Error('native outbound pending receipt');
      if (applied.pending === Boolean(prepared.nothingToExport)) throw new Error('native outbound empty state changed');
      if (
        !Array.isArray(applied.scopes) ||
        applied.scopes.some((scope: unknown) => typeof scope !== 'string' || !scope) ||
        typeof applied.clientId !== 'string' ||
        applied.clientId !== clientId ||
        !Number.isSafeInteger(applied.objectCount) ||
        applied.objectCount < (applied.pending ? 1 : 0)
      )
        throw new Error('native outbound remote receipt');
      if (applied.pending) {
        loader.start('verifying that objects can be merged on the remotes...');
        for (const scope of applied.scopes) loader.start(`persisting data on the remote "${scope}"...`);
      }
      const finalized = await request({ kind: 'commandOutboundFinalize', token: prepared.token });
      if (finalized?.applied !== true) throw new Error('native outbound finalize receipt');
      const published = validateRustOutboundReceipt(finalized);
      if (published.token !== prepared.token) throw new Error('native outbound publication changed');
      const report = await formatRustWorkspaceOutbound(published, options);
      return report;
    },
    () => committing,
    (response, input) =>
      'kind' in input && String(input.kind).startsWith('commandOutbound')
        ? new Error(response.error ?? 'native outbound request declined')
        : undefined
  );
}

export async function runRustWorkspaceOutbound(): Promise<boolean> {
  const options = parseRustWorkspaceOutbound(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (root === parent) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceOutbound>>;
  try {
    result = await readRustWorkspaceOutbound(root, homedir(), options, async () => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        {
          name: 'export [component-patterns...]',
          description: '',
          loader: true,
          report: async () => result ?? '',
        },
        [options.ids],
        {},
        Slot.withType<any>()(() => 'teambit.harmony/bit')
      );
      logger.commandHistoryBasePath = path.join(root, '.bit');
      logger.writeCommandHistoryStart();
      await runner.prepareForExecution();
    });
  } catch (error) {
    if (!runner) throw error;
    const { handleErrorAndExit } = await import('@teambit/cli/dist/handle-errors.js');
    await handleErrorAndExit(error as Error, 'export');
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
