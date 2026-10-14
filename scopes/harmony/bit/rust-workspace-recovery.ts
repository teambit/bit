import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { GLOBAL_CONFIG, GLOBAL_REMOTES } from '@teambit/legacy.constants';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { captureRustClientCurrent, withRustClientRequest } from './rust-client-capture';
import { nativeDependencyGrammar } from './rust-fresh-dependencies';
import { commandProgress } from './rust-workspace-command-progress';
import { formatRustWorkspaceRecovery } from './rust-workspace-recovery-report';
import { recoveryProofProjection } from './rust-workspace-recovery-proof';
import { parseRustWorkspaceRecovery, type RustRecoveryOptions } from './rust-workspace-recovery-options';

function captureTargets(prepared: any) {
  if (!Array.isArray(prepared.targets) || prepared.targets.length > 4096 || !Array.isArray(prepared.captureTargets))
    throw new Error('recovery targets');
  const known = new Map(prepared.targets.map((target: any) => [target.identity, target]));
  const seen = new Set();
  for (const target of prepared.captureTargets) {
    if (seen.has(target.identity) || JSON.stringify(target) !== JSON.stringify(known.get(target.identity)))
      throw new Error('recovery capture target');
    seen.add(target.identity);
  }
  for (const target of prepared.targets)
    if (!seen.has(target.identity) && target.missingRoot !== true) throw new Error('recovery missing capture');
  return prepared.captureTargets;
}

export async function readRustWorkspaceRecovery(
  root: string,
  home: string,
  options: RustRecoveryOptions,
  beforeCommit?: (
    report: ReturnType<typeof formatRustWorkspaceRecovery>,
    progress: () => Promise<void>
  ) => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      const { operation, ...commandOptions } = options;
      const prepared = await request({
        kind: 'commandRecoveryPrepare',
        root,
        home,
        operation,
        options: commandOptions,
        dependencyGrammar: nativeDependencyGrammar(),
        globalRemotesFile: path.join(GLOBAL_CONFIG, GLOBAL_REMOTES),
      });
      if (typeof prepared.token !== 'string' || !prepared.context) return undefined;
      let projection: ReturnType<typeof recoveryProofProjection> | undefined;
      const captureRequest = async (input: any) =>
        request(
          projection && input.kind === 'dependencyFreshValidate'
            ? { ...input, readSet: input.readSet.map(projection.project) }
            : input
        );
      const capture = await captureRustClientCurrent(root, prepared.context, captureRequest, captureTargets(prepared), {
        recoveryDiscardedSources: true,
        resetDependencyCache: operation === 'laneAbort',
      });
      if (!capture) return undefined;
      const semver = snapshotSemverGrammar(
        prepared.context.models.flatMap((model: any) => [
          ...Object.keys(model.versions ?? {}),
          ...Object.keys(model.orphanedVersions ?? {}),
        ])
      );
      if (!semver) return undefined;
      const planned = await request({
        kind: 'commandRecoveryPlan',
        token: prepared.token,
        current: capture.captured,
        dependencyReadSet: capture.dependencyReadSet,
        semver,
      });
      if (planned.token !== prepared.token || !capture.fresh()) return undefined;
      const report = formatRustWorkspaceRecovery(planned.result, options);
      const progress = commandProgress(planned.progress, 'recovery');
      await beforeCommit?.(report, progress);
      if (!capture.fresh()) throw new Error('recovery capture changed before publication');
      const fileId = currentDateAndTimeToFileName();
      committing = true;
      let dependencyReadSet = capture.dependencyReadSet;
      if (operation === 'laneAbort') {
        const restored = await request({
          kind: 'commandRecoveryRestore',
          token: prepared.token,
          dependencyReadSet,
          fileId,
        });
        if (restored.restored !== true) throw new Error('native recovery restore receipt');
        projection = recoveryProofProjection(
          root,
          dependencyReadSet,
          restored.dependencyReadSet,
          restored.restoredControls
        );
        dependencyReadSet = projection.readSet;
      }
      let checkoutError: { message: string } | undefined;
      try {
        await capture.commit();
      } catch (error) {
        if (operation !== 'laneAbort') throw error;
        checkoutError = { message: error instanceof Error ? error.message : String(error) };
      }
      const applied = await request({
        kind: 'commandRecoveryApply',
        token: prepared.token,
        dependencyReadSet,
        fileId,
        ...(checkoutError && { checkoutError }),
      });
      if (applied.applied !== true) throw new Error('native recovery apply receipt');
      return applied.result === undefined ? report : formatRustWorkspaceRecovery(applied.result, options);
    },
    () => committing
  );
}

export async function runRustWorkspaceRecovery(): Promise<boolean> {
  const options = parseRustWorkspaceRecovery(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceRecovery>>;
  try {
    result = await readRustWorkspaceRecovery(root, homedir(), options, async (report, progress) => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        {
          name: options.operation === 'laneAbort' ? 'merge-abort' : 'merge [component-pattern]',
          description: '',
          loader: true,
          report: async () => result ?? report,
        },
        options.pattern ? [options.pattern] : [],
        {},
        Slot.withType<any>()(() => 'teambit.harmony/bit')
      );
      logger.commandHistoryBasePath = path.join(root, '.bit');
      logger.writeCommandHistoryStart();
      await runner.prepareForExecution();
      await progress();
    });
  } catch (error) {
    if (!runner) throw error;
    const { handleErrorAndExit } = await import('@teambit/cli/dist/handle-errors.js');
    await handleErrorAndExit(error as Error, options.operation === 'laneAbort' ? 'merge-abort' : 'merge');
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
