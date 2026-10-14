import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import { GLOBAL_CONFIG, GLOBAL_REMOTES } from '@teambit/legacy.constants';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { loader } from '@teambit/legacy.loader';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { getAspectDir } from '@teambit/aspect-loader/dist/core-aspects.js';
import { withRustClientRequest } from './rust-client-capture';
import { commandProgress } from './rust-workspace-command-progress';
import { parseRustWorkspaceInbound, type RustWorkspaceInboundOptions } from './rust-workspace-inbound-options';
import { formatRustWorkspaceInbound, validateRustInboundReceipt } from './rust-workspace-inbound-report';

/** Native transfer owns every object byte; JavaScript handles only the command's scalar report. */
export async function readRustWorkspaceInbound(
  root: string,
  home: string,
  options: RustWorkspaceInboundOptions,
  beforeCommit?: (report: string) => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      const prepared = validateRustInboundReceipt(
        await request({
          kind: 'commandInboundPrepare',
          root,
          home,
          globalRemotesFile: path.join(GLOBAL_CONFIG, GLOBAL_REMOTES),
          globalConfigDir: GLOBAL_CONFIG,
          nodeExecutable: process.execPath,
          bitDir: getAspectDir('teambit.harmony/bit'),
          bitVersion: getBitVersion(),
          bitmapHistoryFileId: options.objectsOnly ? undefined : currentDateAndTimeToFileName(),
          operation: options.operation,
          ids: options.ids,
          options: {
            objectsOnly: options.objectsOnly,
            allHistory: options.allHistory,
            fromOriginalScope: options.fromOriginalScope,
            skipDependencyInstallation: options.skipDependencyInstallation,
            lanes: false,
            components: options.operation === 'fetch',
          },
        })
      );
      const progress = commandProgress({ bitmapCount: 0, imports: prepared.progress }, 'inbound');
      const report = await formatRustWorkspaceInbound(prepared, options);
      await beforeCommit?.(report);
      const started = process.hrtime();
      committing = true;
      const applied = await request({ kind: 'commandInboundApply', token: prepared.token });
      if (applied.applied !== true) throw new Error('native inbound apply receipt');
      const published = validateRustInboundReceipt(applied);
      if (
        published.token !== prepared.token ||
        JSON.stringify(published.importedIds) !== JSON.stringify(prepared.importedIds) ||
        JSON.stringify(published.importDetails) !== JSON.stringify(prepared.importDetails)
      )
        throw new Error('native inbound publication changed');
      await progress();
      loader.succeed('importing components', started);
      return report;
    },
    () => committing
  );
}

export async function runRustWorkspaceInbound(): Promise<boolean> {
  const options = parseRustWorkspaceInbound(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (root === parent) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceInbound>>;
  try {
    result = await readRustWorkspaceInbound(root, homedir(), options, async (report) => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        {
          name: options.operation === 'fetch' ? 'fetch [ids...]' : 'import [component-patterns...]',
          description: '',
          loader: true,
          report: async () => result ?? report,
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
    await handleErrorAndExit(error as Error, options.operation);
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
