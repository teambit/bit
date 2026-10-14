import fs from 'fs';
import chalk from 'chalk';
import { loader } from '@teambit/legacy.loader';
import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import path from 'path';
import { homedir } from 'os';
import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import { GLOBAL_CONFIG, GLOBAL_REMOTES, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import { configGetter } from '@teambit/config-store/dist/config-getter.js';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { captureRustClientCurrent, withRustClientRequest } from './rust-client-capture';
import { nativeDependencyGrammar } from './rust-fresh-dependencies';
import { commandProgress } from './rust-workspace-command-progress';
import { parseRustWorkspaceTag, type RustWorkspaceTagOptions } from './rust-workspace-tag-options';
import { formatRustWorkspaceTag } from './rust-workspace-tag-report';
import {
  resolveComponentReceipts,
  resolveSemver,
    validateResolveIssues,
} from './rust-workspace-resolve-metadata';
import { tagSnapshotReceipt } from './rust-workspace-tag-receipt';
import { tagPatternSelections } from './rust-workspace-tag-selection';

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

export async function readRustWorkspaceTag(
  root: string,
  home: string,
  options: RustWorkspaceTagOptions,
  beforeCommit?: (
    report: ReturnType<typeof formatRustWorkspaceTag>,
    progress: ReturnType<typeof commandProgress>
  ) => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      if (configGetter.getConfigBoolean(CFG_FORCE_LOCAL_BUILD)) return undefined;
      const prepared = await request({
        kind: 'commandTagPrepare',
        root,
        home,
        options: { message: options.message, unmodified: options.unmodified, unmerged: options.unmerged, build: false },
        tagOptions: { patterns: options.patterns, releaseType: options.releaseType, autoTagReleaseType: options.autoTagReleaseType, incrementBy: options.incrementBy, exactVersion: options.exactVersion, preReleaseId: options.preReleaseId, snapped: options.snapped, skipAutoTag: options.skipAutoTag },
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
      const capturedSemver = resolveSemver(prepared.context, capture);
      if (!capturedSemver) return undefined;
      const tagSelections = tagPatternSelections(prepared.context, options.patterns);
      const entered = [options.exactVersion, ...(tagSelections ?? []).map((row) => row.version)].filter((value): value is string => typeof value === 'string');
      const semver = snapshotSemverGrammar([...Object.keys(capturedSemver), ...entered]);
      if (!semver) return undefined;
      const plan = await request({
        kind: 'commandTagPlan',
        token: prepared.token,
        current: capture.captured,
        dependencyReadSet: capture.dependencyReadSet,
        semver,
        tagSelections,
        components: resolveComponentReceipts(prepared.context, capture),
      });
      if (plan.token !== prepared.token || !capture.fresh()) return undefined;
      formatRustWorkspaceTag(plan.result);
      commandProgress(plan.progress, 'tag');
      if (!Array.isArray(plan.needsSnap)) return undefined;
      if (plan.noop === true) {
        if (plan.result !== null || plan.needsSnap.length) return undefined;
        const report = formatRustWorkspaceTag(null);
        const progress = commandProgress(plan.progress, 'tag');
        committing = true;
        await beforeCommit?.(report, progress);
        await capture.commit();
        const applied = await request({
          kind: 'commandTagApply',
          token: prepared.token,
          dependencyReadSet: capture.dependencyReadSet,
          fileId: currentDateAndTimeToFileName(),
        });
        if (applied.applied !== true) throw new Error('native snap noop receipt');
        return report;
      }
      await validateResolveIssues(root, prepared.context, capture, plan.needsSnap, plan.issueGraph);
      const snapReceipt = await tagSnapshotReceipt(plan.needsSnap, plan.scalarPreparation);
      const finalized = await request({
        kind: 'commandTagFinalize',
        token: prepared.token,
        snapReceipt,
        dependencyReadSet: capture.dependencyReadSet,
      });
      if (finalized.token !== prepared.token || !capture.fresh()) return undefined;
      const report = formatRustWorkspaceTag(finalized.result);
      const progress = commandProgress(finalized.progress ?? plan.progress, 'tag');
      committing = true;
      await beforeCommit?.(report, progress);
      await capture.commit([], false, undefined, false, true);
      const applied = await request({
        kind: 'commandTagApply',
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

export async function runRustWorkspaceTag(): Promise<boolean> {
  const options = parseRustWorkspaceTag(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (root === parent) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceTag>>;
  try {
    result = await readRustWorkspaceTag(root, homedir(), options, async (report, progress) => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        { name: 'tag [component-patterns...]', description: '', loader: true, report: async () => result ?? report },
        [options.patterns],
        {},
        Slot.withType<any>()(() => 'teambit.harmony/bit')
      );
      logger.commandHistoryBasePath = path.join(root, '.bit');
      logger.writeCommandHistoryStart();
      await runner.prepareForExecution();
      const warn = (message: string) => { logger.warn(message); loader.warn(chalk.yellow(message)); };
      if (!options.message) warn('--message will be mandatory in the next few releases. make sure to add a message with your tag');
      warn(`tagging components on "main" lane when using remote build is not recommended. To avoid SemVer versions of your component with failing builds, please refer to:
- Snap changes in a different lane and merge to "main" on your remote (learn more on lanes - https://bit.dev/reference/lanes/getting-started-with-lanes)
- Use \`bit tag --build\` to build your components locally.
- Use \`snap\` or \`build\` first to validate your build passing, and then version and export safely.

To undo local tag use the "bit reset" command.`);
      loader.start('determine components to tag...');
      await progress();
    });
  } catch (error) {
    if (!runner) throw error;
    const { handleErrorAndExit } = await import('@teambit/cli/dist/handle-errors.js');
    await handleErrorAndExit(error as Error, 'tag');
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
