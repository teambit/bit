import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { currentDateAndTimeToFileName } from '@teambit/legacy.consumer/dist/bitmap-history-file-id.js';
import { GLOBAL_CONFIG, GLOBAL_REMOTES, CFG_FORCE_LOCAL_BUILD } from '@teambit/legacy.constants';
import type { CommandRunner } from '@teambit/cli/dist/command-runner.js';
import { configGetter } from '@teambit/config-store/dist/config-getter.js';
import { nativeDependencyGrammar } from './rust-fresh-dependencies';
import { commandProgress } from './rust-workspace-command-progress';
import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { withRustClientRequest, captureRustClientCurrent } from './rust-client-capture';
import { parseRustWorkspaceCommand, type RustWorkspaceCommandOptions } from './rust-workspace-command-options';
import { formatRustWorkspaceCommand } from './rust-workspace-command-report';
import type { FreshDependencyCache } from './rust-fresh-dependencies';

export async function readRustWorkspaceCommand(
  root: string,
  home: string,
  options: RustWorkspaceCommandOptions,
  beforeCommit?: (
    report: ReturnType<typeof formatRustWorkspaceCommand>,
    progress: ReturnType<typeof commandProgress>
  ) => Promise<void>
) {
  let committing = false;
  return withRustClientRequest(
    async (request) => {
      if (options.operation === 'merge' && configGetter.getConfigBoolean(CFG_FORCE_LOCAL_BUILD)) return undefined;
      const { operation, ...commandOptions } = options;
      const prepared = await request({
        kind: 'commandPrepare',
        root,
        home,
        operation,
        dependencyGrammar: nativeDependencyGrammar(),
        options: commandOptions,
        globalRemotesFile: path.join(GLOBAL_CONFIG, GLOBAL_REMOTES),
      });
      if (typeof prepared.token !== 'string' || !prepared.context) return undefined;
      let capture = await captureRustClientCurrent(root, prepared.context, request, prepared.targets, {
        verifyFreshDependencies: operation === 'merge',
        retainDependencyState: operation === 'merge',
      });
      if (!capture) return undefined;
      const semver = snapshotSemverGrammar([
        options.to ?? '',
        ...prepared.context.models.flatMap((model) => [
          ...Object.keys(model.versions ?? {}),
          ...Object.keys(model.orphanedVersions ?? {}),
        ]),
      ]);
      if (!semver) return undefined;
      let plan = await request({
        kind: 'commandPlan',
        token: prepared.token,
        current: capture.captured,
        dependencyReadSet: capture.dependencyReadSet,
        semver,
      });
      if (plan.token !== prepared.token || !capture.fresh()) return undefined;
      let dependencyCaches: FreshDependencyCache[] = [];
      if (plan.policyPreparation !== undefined) {
        if (operation !== 'merge') return undefined;
        const { prepareRustCommandPolicy } = await import('./rust-workspace-command-policy');
        const projected = await prepareRustCommandPolicy(prepared, plan, capture.dependencyStates, request);
        plan = projected.plan;
        dependencyCaches = projected.dependencyCaches;
        if (!capture.fresh()) return undefined;
      }
      const snapFailed = plan.snapFailed === true;
      if (snapFailed && (plan.needsSnap !== undefined || !plan.result?.mergeSnapError)) return undefined;
      if (plan.needsSnap !== undefined || snapFailed) {
        if (
          (!snapFailed && !Array.isArray(plan.needsSnap)) ||
          (plan.needsSnap?.length ?? 0) > 4096 ||
          options.operation !== 'merge' ||
          options.noSnap
        )
          return undefined;
        if ((plan.needsSnap ?? []).some((identity) => typeof identity !== 'string' || identity.length > 4096))
          return undefined;
        // App eligibility covers the whole workspace before canonical cache reset.
        // Failed issue checks repopulate only the divergent targets' staged caches.
        if (snapFailed && !dependencyCaches.length) return undefined;
        const allCapture = await captureRustClientCurrent(root, prepared.context, request, undefined, {
          verifyFreshDependencies: true,
          resetDependencyCache: true,
          dependencyCacheVersions: plan.dependencyCacheVersions,
        });
        if (!allCapture || !capture.fresh() || !allCapture.fresh()) return undefined;
        if (
          allCapture.captured.some((component) =>
            component.files.some((file: string) => /\.(?:bit-app|node-app|react-app)\.[^/]+$/.test(file))
          )
        )
          return undefined;
        const changed = new Set([
          ...(plan.needsSnap ?? []),
          ...(plan.dependencyCacheVersions ?? []).map((target) => target.identity),
          ...dependencyCaches.map((entry) => entry.identity.slice(0, entry.identity.lastIndexOf('@'))),
        ]);
        if (
          !snapFailed &&
          allCapture.captured.some((component) =>
            [...component.current.dependencies, ...component.current.devDependencies].some((dependency) =>
              changed.has(`${dependency.id.scope}/${dependency.id.name}`)
            )
          )
        )
          return undefined;
        capture = allCapture;
        const { validateRustCommandIssues } = await import('./rust-workspace-command-issues');
        await validateRustCommandIssues(root, prepared.context, capture.components, plan);
        // Reject unsupported presentation receipts before allocating snapshot identities.
        formatRustWorkspaceCommand(plan.result, options);
        commandProgress(plan.progress, options.operation);
        if (!snapFailed) {
          const { newSnapHash, newSnapBatchId } = await import('@teambit/snapping/dist/new-snap-hash.js');
          const { getBasicLog } = await import('@teambit/harmony.modules.get-basic-log');
          const { getBitVersion } = await import('@teambit/bit.get-bit-version');
          const bitVersion = getBitVersion();
          const batchId = newSnapBatchId();
          const versions = plan.needsSnap.map((identity) => ({ identity, hash: newSnapHash() }));
          const log = await getBasicLog();
          plan = await request({
            kind: 'commandFinalize',
            token: prepared.token,
            snapReceipt: { versions, log, batchId, bitVersion },
            dependencyReadSet: capture.dependencyReadSet,
          });
          if (plan.token !== prepared.token || !capture.fresh()) return undefined;
        }
      }
      // Resolve every presentation dependency and validate metadata before durable changes.
      const report = formatRustWorkspaceCommand(plan.result, options);
      const progress = commandProgress(plan.progress, options.operation);
      committing = true;
      await beforeCommit?.(report, progress);
      await capture.commit(dependencyCaches, snapFailed);
      const applied = await request({
        kind: 'commandApply',
        token: prepared.token,
        dependencyReadSet: capture.dependencyReadSet,
        fileId: currentDateAndTimeToFileName(),
      });
      if (applied.applied !== true) throw new Error('native command apply receipt');
      return report;
    },
    () => committing
  );
}

export async function runRustWorkspaceCommand(): Promise<boolean> {
  const options = parseRustWorkspaceCommand(process.argv.slice(2));
  if (!options) return false;
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'workspace.jsonc'))) {
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
  let runner: CommandRunner | undefined;
  let result: Awaited<ReturnType<typeof readRustWorkspaceCommand>>;
  try {
    result = await readRustWorkspaceCommand(root, homedir(), options, async (report, progress) => {
      const { CommandRunner } = await import('@teambit/cli/dist/command-runner.js');
      const { logger } = await import('@teambit/legacy.logger');
      const { Slot } = await import('@teambit/harmony');
      runner = new CommandRunner(
        {
          name: options.operation === 'checkout' ? 'checkout <to> [component-pattern]' : 'merge [component-pattern]',
          description: '',
          loader: true,
          report: async () => report,
        },
        [options.to, options.pattern].filter((arg): arg is string => arg !== undefined),
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
    await handleErrorAndExit(error as Error, options.operation);
    return true;
  }
  if (result === undefined) return false;
  await runner!.runCommand();
  return true;
}
