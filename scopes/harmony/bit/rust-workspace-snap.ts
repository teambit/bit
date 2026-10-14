import fs from 'fs';
import chalk from 'chalk';
import { loader } from '@teambit/legacy.loader';
import path from 'path';
import { homedir } from 'os';
import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import { GLOBAL_CONFIG, GLOBAL_REMOTES, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import { configGetter } from '@teambit/config-store/dist/config-getter.js';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { captureRustClientCurrent, withRustClientRequest } from './rust-client-capture';
import { nativeDependencyGrammar } from './rust-fresh-dependencies';
import { commandProgress } from './rust-workspace-command-progress';
import { parseRustWorkspaceSnap, type RustWorkspaceSnapOptions } from './rust-workspace-snap-options';
import { formatRustWorkspaceSnap } from './rust-workspace-snap-report';
import {
  resolveComponentReceipts,
  resolveSemver,
  resolvePatternIds,
  validateResolveIssues,
} from './rust-workspace-resolve-metadata';
import { resolveSnapshotReceipt } from './rust-workspace-resolve-receipt';

function validatePreparation(prepared: any) {
  if (
    !prepared ||
    typeof prepared.token !== 'string' ||
    !prepared.context ||
    !Array.isArray(prepared.targets) ||
    prepared.targets.length > 4096 ||
    !Array.isArray(prepared.selectedIds) ||
    prepared.selectedIds.length > 4096
  )
    throw new Error('resolve preparation receipt');
  const targets = prepared.context.targets;
  if (!Array.isArray(targets) || JSON.stringify(targets) !== JSON.stringify(prepared.targets))
    throw new Error('resolve workspace capture receipt');
  const known = new Set(targets.map((target: any) => target.identity));
  if (
    known.size !== targets.length ||
    new Set(prepared.selectedIds).size !== prepared.selectedIds.length ||
    prepared.selectedIds.some((identity: any) => typeof identity !== 'string' || !known.has(identity))
  )
    throw new Error('resolve selection receipt');
}

export async function readRustWorkspaceSnap(
  root: string,
  home: string,
  options: RustWorkspaceSnapOptions,
  beforeCommit?: (
    report: ReturnType<typeof formatRustWorkspaceSnap>,
    progress: ReturnType<typeof commandProgress>
  ) => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      if (configGetter.getConfigBoolean(CFG_FORCE_LOCAL_BUILD)) return undefined;
      const prepared = await request({
        kind: 'commandSnapPrepare',
        root,
        home,
        options,
        dependencyGrammar: nativeDependencyGrammar(),
        globalRemotesFile: path.join(GLOBAL_CONFIG, GLOBAL_REMOTES),
      });
      validatePreparation(prepared);
      const capture = await captureRustClientCurrent(root, prepared.context, request, prepared.targets, {
        verifyFreshDependencies: true,
        retainDependencyState: true,
        resetDependencyCache: false,
      });
      if (!capture) return undefined;
      const semver = resolveSemver(prepared.context, capture);
      if (!semver) return undefined;
      const plan = await request({
        kind: 'commandSnapPlan',
        token: prepared.token,
        current: capture.captured,
        dependencyReadSet: capture.dependencyReadSet,
        semver,
        selectedIds: options.unmerged ? undefined : resolvePatternIds(prepared.context, options.pattern),
        components: resolveComponentReceipts(prepared.context, capture),
      });
      if (plan.token !== prepared.token || !capture.fresh()) return undefined;
      formatRustWorkspaceSnap(plan.result);
      commandProgress(plan.progress, 'snap');
      if (!Array.isArray(plan.needsSnap)) return undefined;
      if (plan.noop === true) {
        if (plan.result !== null || plan.needsSnap.length) return undefined;
        const report = formatRustWorkspaceSnap(null);
        const progress = commandProgress(plan.progress, 'snap');
        committing = true;
        await beforeCommit?.(report, progress);
        await capture.commit();
        const applied = await request({
          kind: 'commandSnapApply',
          token: prepared.token,
          dependencyReadSet: capture.dependencyReadSet,
          fileId: currentDateAndTimeToFileName(),
        });
        if (applied.applied !== true) throw new Error('native snap noop receipt');
        return report;
      }
      await validateResolveIssues(root, prepared.context, capture, plan.needsSnap, plan.issueGraph);
      const snapReceipt = await resolveSnapshotReceipt(plan.needsSnap, plan.scalarPreparation);
      const finalized = await request({
        kind: 'commandSnapFinalize',
        token: prepared.token,
        snapReceipt,
        dependencyReadSet: capture.dependencyReadSet,
      });
      if (finalized.token !== prepared.token || !capture.fresh()) return undefined;
      const report = formatRustWorkspaceSnap(finalized.result);
      const progress = commandProgress(finalized.progress ?? plan.progress, 'snap');
      committing = true;
      await beforeCommit?.(report, progress);
      await capture.commit([], false, undefined, false, true);
      const applied = await request({
        kind: 'commandSnapApply',
        token: prepared.token,
        dependencyReadSet: capture.dependencyReadSet,
        fileId: currentDateAndTimeToFileName(),
      });
      if (applied.applied !== true) throw new Error('native snap apply receipt');
      return report;
    },
    () => committing
  );
}

export async function runRustWorkspaceSnap(): Promise<boolean> {
  const options = parseRustWorkspaceSnap(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (root === parent) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceSnap>>;
  try {
    result = await readRustWorkspaceSnap(root, homedir(), options, async (report, progress) => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        { name: 'snap [component-pattern]', description: '', loader: true, report: async () => result ?? report },
        options.pattern ? [options.pattern] : [],
        {},
        Slot.withType<any>()(() => 'teambit.harmony/bit')
      );
      logger.commandHistoryBasePath = path.join(root, '.bit');
      logger.writeCommandHistoryStart();
      await runner.prepareForExecution();
      if (!options.message) {
        const warning =
          '--message will be mandatory in the next few releases. make sure to add a message with your snap, will be displayed in the version history';
        logger.warn(warning);
        loader.warn(chalk.yellow(warning));
      }
      await progress();
    });
  } catch (error) {
    if (!runner) throw error;
    const { handleErrorAndExit } = await import('@teambit/cli/dist/handle-errors.js');
    await handleErrorAndExit(error as Error, 'snap');
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
