import { types } from 'util';
import type { Consumer } from '@teambit/legacy.consumer';
import type { ComponentID } from '@teambit/component-id';
import type { Version } from '@teambit/objects';
import { hasRustSnapshotTransactionClassFields, hasRustSnapshotFunctions } from '@teambit/objects';
import {
  SourceFile,
  RemovePath,
  DataToPersist,
  compareRustCheckoutSource,
  getRustFileStatuses,
  isRustWorkspaceEngine,
  hasRustWorkspaceEngineOwner,
  getRustCheckoutPlanSourceDescriptor,
  installRustCheckoutPlanSourceContents,
} from '@teambit/component.sources';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { isWorkspaceMapFile, WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import type { ApplyVersionResult, FilesStatus, MergeResultsThreeWay } from '@teambit/component.modules.merge-helper';
import {
  applyModifiedVersion,
  applyModifiedVersionWithPlan,
  hasRustCheckoutApplyFunctions,
  FileStatus,
  MergeOptions,
} from '@teambit/component.modules.merge-helper';
import type { CheckoutProps } from './checkout.main.runtime';
import { prepareRustCheckout } from './rust-checkout';
import {
  prepareRustCheckoutFiles,
  getPreparedCheckoutMerge,
  checkoutPlanFile,
  checkoutPlanMatchesVersion,
  type PreparedCheckoutFiles,
} from './rust-checkout-files';
import { requestRustCheckout } from './rust-checkout-transition';

export type ComponentStatusBase = {
  currentComponent?: ConsumerComponent;
  componentFromModel?: Version;
  id: ComponentID;
  shouldBeRemoved?: boolean; // in case the component is soft-removed, it should be removed from the workspace
  unchangedMessage?: string; // this gets populated either upon skip or failure.
  unchangedLegitimately?: boolean; // true for skipped legitimately (e.g. already up to date). false for failure.
};

export type ComponentStatus = ComponentStatusBase & {
  mergeResults?: MergeResultsThreeWay | null | undefined;
};

export type ApplyVersionWithComps = {
  applyVersionResult: ApplyVersionResult;
  component?: ConsumerComponent;
  // in case the component needs to be written to the filesystem, this is the component to write.
  legacyCompToWrite?: ConsumerComponent;
};

/**
 * This function optionally returns "component" object. If it returns, it means it needs to be written to the filesystem.
 * Otherwise, it means the component is already up to date and no need to write it.
 *
 * If no need to change anything (ours), then don't return the component object.
 * Otherwise, either return the component object as is (if no conflicts or "theirs"), or change the files in this
 * component object. Later, this component object is written to the filesystem.
 *
 * 1) when the files are modified with conflicts and the strategy is "ours", or forceOurs was used, leave the FS as is.
 *
 * 2) when the files are modified with conflicts and the strategy is "theirs", or forceTheirs was used, write the
 * component according to "component" object
 *
 * 3) when files are modified with no conflict or files are modified with conflicts and the
 * strategy is manual, load the component according to id.version and update component.files.
 * applyModifiedVersion() docs explains what files are updated/added.
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
export async function applyVersion(
  consumer: Consumer,
  id: ComponentID,
  componentFromFS: ConsumerComponent | null | undefined, // it can be null only when isLanes is true
  mergeResults: MergeResultsThreeWay | null | undefined,
  checkoutProps: CheckoutProps,
  targetModelVersion?: Version
): Promise<ApplyVersionWithComps> {
  if (!checkoutProps.isLane && !componentFromFS)
    throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
  const { mergeStrategy, forceOurs } = checkoutProps;
  let filesStatus = {};
  // "keep ours" is meaningful only when the component is on the filesystem. during a lane
  // switch/import (isLane), a component may exist on the lane but not in the workspace at all -
  // there are no local files to preserve, so fall through and write it from the model.
  const hasConflicts = componentFromFS ? mergeResults?.hasConflicts : undefined;
  let keepOurs = keepCurrentFiles(Boolean(componentFromFS), hasConflicts, mergeStrategy, forceOurs);
  if (canDecideKeepOurs(hasConflicts, forceOurs)) {
    const decision = await requestRustCheckout(
      {
        kind: 'checkoutApplyDecision',
        currentExists: Boolean(componentFromFS),
        hasConflicts: Boolean(hasConflicts),
        forceOurs: Boolean(forceOurs),
        strategy: mergeStrategy,
      },
      (value): value is { keepOurs: boolean } => value && typeof value.keepOurs === 'boolean'
    );
    if (decision) keepOurs = decision.keepOurs;
  }
  if (keepOurs && componentFromFS) {
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    return { applyVersionResult: { id, filesStatus } };
  }
  let transition = getPreparedCheckoutMerge(mergeResults);
  if (shouldPrepareTransition(transition, mergeResults, targetModelVersion))
    transition = await prepareRustCheckoutFiles(
      consumer.scope.objects,
      targetModelVersion!,
      componentFromFS || undefined
    );
  const sourceFiles = transition && ordinaryTargetLoader(consumer) ? targetPlanFiles(transition) : undefined;
  let prepared = shouldPrepareLegacyCheckout(transition, mergeResults)
    ? await prepareRustCheckout(consumer, id, componentFromFS)
    : undefined;
  if (prepared && !prepared.valid()) prepared = undefined;
  let usedTransition = false;
  const sourceFactory =
    sourceFiles && transition
      ? targetSourceFactory(transition, sourceFiles, () => {
          usedTransition = true;
        })
      : undefined;
  const component =
    prepared?.component ||
    (sourceFactory
      ? await consumer.loadComponentFromModelImportIfNeeded(id, true, sourceFactory)
      : await consumer.loadComponentFromModelImportIfNeeded(id));
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new BitError('applyVersion: componentMap was not found');

  const files = component.files;
  if (transition && usedTransition && transition.valid()) {
    const checkpoint = trackedCheckpoint(consumer, componentFromFS || undefined);
    const removal =
      checkpoint?.native &&
      (await requestRustCheckout(
        {
          kind: 'checkoutRemovals',
          token: transition.plan.token,
          tracked: checkpoint.tracked,
          workspaceRoot: checkpoint.workspaceRoot,
        },
        (value): value is Removal =>
          validRemoval(value) && transition!.valid() && validRemovalPaths(value, transition!, checkpoint)
      ));
    if (removal && transition.valid()) {
      for (const status of removal.statuses) filesStatus[status.relativePath] = FileStatus[status.status];
      const data = new DataToPersist();
      for (const filename of removal.removals) data.removePath(new RemovePath(filename));
      await data.persistAllToFS();
    } else {
      await updateFileStatusWithRust(files, filesStatus, componentFromFS || undefined);
      await removeFilesIfNeeded(filesStatus, consumer, componentFromFS || undefined, checkpoint);
      transition = undefined;
    }
    if (
      mergeResults &&
      transition &&
      hasRustSnapshotFunctions(['CheckoutPublicApplyGuard']) &&
      hasRustCheckoutApplyFunctions()
    ) {
      const liveTransition = transition;
      const resultsToApply = mergeResults;
      const { filesStatus: modifiedStatus, modifiedFiles } = await applyModifiedVersionWithPlan(
        files,
        resultsToApply,
        mergeStrategy,
        (clones) =>
          applyRetainedCheckout(
            clones,
            resultsToApply,
            liveTransition,
            mergeStrategy,
            Boolean(forceOurs),
            Boolean(componentFromFS),
            checkpoint!
          )
      );
      filesStatus = { ...filesStatus, ...modifiedStatus };
      component.files = modifiedFiles;
      mergeResults = undefined;
    }
  } else if (prepared) {
    for (const status of prepared.statuses) filesStatus[status.relativePath] = FileStatus[status.status];
    const data = new DataToPersist();
    for (const filename of prepared.removals) data.removePath(new RemovePath(filename));
    await data.persistAllToFS();
  } else {
    await updateFileStatusWithRust(files, filesStatus, componentFromFS || undefined);
    await removeFilesIfNeeded(filesStatus, consumer, componentFromFS || undefined);
  }

  if (mergeResults) {
    // update files according to the merge results
    const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
    filesStatus = { ...filesStatus, ...modifiedStatus };
    component.files = modifiedFiles;
  }

  // in case of forceTheirs, the mergeResults is undefined, the "component" object is according to "theirs", so it'll work
  // expected. (later, it writes the component object).

  return {
    applyVersionResult: { id, filesStatus },
    component,
  };
}

function keepCurrentFiles(
  currentExists: boolean,
  hasConflicts: boolean | undefined,
  strategy: CheckoutProps['mergeStrategy'],
  forceOurs: CheckoutProps['forceOurs']
): boolean {
  return Boolean(currentExists && ((hasConflicts && strategy === MergeOptions.ours) || forceOurs));
}

function shouldPrepareTransition(
  transition: PreparedCheckoutFiles | undefined,
  results: MergeResultsThreeWay | null | undefined,
  version: Version | undefined
): boolean {
  return !transition && !results && Boolean(version) && isRustWorkspaceEngine();
}

function shouldPrepareLegacyCheckout(
  transition: PreparedCheckoutFiles | undefined,
  results: MergeResultsThreeWay | null | undefined
): boolean {
  return !transition && !hasRustWorkspaceEngineOwner() && !results && process.env.BIT_RUST_CLIENT_VCS === 'on';
}

function canDecideKeepOurs(hasConflicts: unknown, forceOurs: unknown): boolean {
  return (
    isRustWorkspaceEngine() &&
    (hasConflicts === undefined || typeof hasConflicts === 'boolean') &&
    (forceOurs === undefined || typeof forceOurs === 'boolean')
  );
}

function targetSourceFactory(prepared: PreparedCheckoutFiles, files: SourceFile[], accepted: () => void) {
  return (version: Version) => {
    if (
      !prepared.valid() ||
      !checkoutPlanMatchesVersion(prepared, version) ||
      !files.every((file) => getRustCheckoutPlanSourceDescriptor(file))
    )
      return undefined;
    accepted();
    return files;
  };
}

async function applyRetainedCheckout(
  clones: SourceFile[],
  results: MergeResultsThreeWay,
  prepared: PreparedCheckoutFiles,
  strategy: CheckoutProps['mergeStrategy'],
  forceOurs: boolean,
  currentExists: boolean,
  checkpoint: { tracked: boolean; workspaceRoot: boolean }
) {
  const valid = () =>
    getPreparedCheckoutMerge(results) === prepared &&
    prepared.valid() &&
    clones.every((file) => getRustCheckoutPlanSourceDescriptor(file));
  if (!valid()) return undefined;
  const applied = await requestRustCheckout(
    {
      kind: 'checkoutApply',
      token: prepared.plan.token,
      strategy,
      forceOurs,
      currentExists,
      tracked: checkpoint.tracked,
      workspaceRoot: checkpoint.workspaceRoot,
    },
    (value): value is Applied => validApply(value) && validSelectors(value, clones, prepared)
  );
  if (!applied || !valid()) return undefined;
  return applySelectors(clones, results, prepared, applied);
}

function ordinaryTargetLoader(consumer: Consumer): boolean {
  return hasRustSnapshotTransactionClassFields(consumer, 'CheckoutConsumer', ['scope', 'bitMap']);
}

function targetPlanFiles(prepared: PreparedCheckoutFiles): SourceFile[] | undefined {
  if (!prepared.valid()) return undefined;
  const files: SourceFile[] = [];
  for (const row of prepared.plan.targetFiles) {
    const model = prepared.targetModels[row.index];
    const cached = prepared.repository.getCache(model.file);
    const alias = cached && Object.getOwnPropertyDescriptor(cached, 'contents')?.value;
    const template = new SourceFile({
      base: '.',
      path: model.relativePath,
      contents: Buffer.alloc(0),
      test: model.test,
    });
    const file = checkoutPlanFile(template, prepared, row, Buffer.isBuffer(alias) ? alias : undefined);
    if (!file) return undefined;
    files.push(file);
  }
  return files;
}

function trackedCheckpoint(
  consumer: Consumer,
  current?: ConsumerComponent
): { tracked: boolean; workspaceRoot: boolean; native: boolean } | undefined {
  if (!current) return { tracked: false, workspaceRoot: false, native: true };
  if (
    !hasRustSnapshotTransactionClassFields(consumer.bitMap, 'CheckoutBitMap', []) ||
    !hasRustSnapshotTransactionClassFields(current, 'ConsumerComponent', ['id', 'files', 'componentMap'])
  )
    return undefined;
  const tracked = Boolean(consumer.bitMap.getComponentIdIfExist(current.id, { ignoreVersion: true }));
  const map = Object.getOwnPropertyDescriptor(current, 'componentMap')?.value;
  const root = map && Object.getOwnPropertyDescriptor(map, 'rootDir');
  return { tracked, workspaceRoot: root?.value === WORKSPACE_ROOT_DIR, native: Boolean(root && 'value' in root) };
}

type Removal = {
  statuses: Array<{ relativePath: string; status: 'updated' | 'unchanged' | 'removed' }>;
  removals: string[];
};
function validRemoval(value: any): value is Removal {
  return (
    value &&
    Array.isArray(value.statuses) &&
    value.statuses.length <= 8192 &&
    value.statuses.every(
      (row) => row && typeof row.relativePath === 'string' && ['updated', 'unchanged', 'removed'].includes(row.status)
    ) &&
    Array.isArray(value.removals) &&
    value.removals.length <= 4096 &&
    value.removals.every((entry) => typeof entry === 'string')
  );
}

function validRemovalPaths(
  value: Removal,
  prepared: PreparedCheckoutFiles,
  checkpoint: { tracked: boolean; workspaceRoot: boolean }
): boolean {
  const targets = new Set(prepared.plan.targetFiles.map((row) => row.relativePath));
  const known = new Set([...targets, ...prepared.plan.currentFiles.map((row) => row.relativePath)]);
  const allowed = new Set(
    prepared.plan.currentFiles
      .filter(
        (row) =>
          checkpoint.tracked &&
          !targets.has(row.relativePath) &&
          !(checkpoint.workspaceRoot && isWorkspaceMapFile(row.relativePath))
      )
      .map((row) => prepared.currentFiles[row.index].path)
  );
  return (
    value.statuses.every((row) => known.has(row.relativePath)) &&
    new Set(value.removals).size === value.removals.length &&
    value.removals.every((entry) => allowed.has(entry))
  );
}

type Applied = {
  keepOurs: boolean;
  files: Array<{ kind: 'target' | 'current'; index: number; planIndex: number; relativePath: string }>;
  filesStatus: Array<{ relativePath: string; status: keyof typeof FileStatus }>;
  removals: string[];
  deferredError?: { phase: 'applyModified'; message: string };
};
function validApply(value: any): value is Applied {
  return (
    value &&
    value.keepOurs === false &&
    Array.isArray(value.files) &&
    value.files.length <= 8192 &&
    value.files.every(
      (row) =>
        row &&
        ['target', 'current'].includes(row.kind) &&
        Number.isSafeInteger(row.index) &&
        row.index >= 0 &&
        Number.isSafeInteger(row.planIndex) &&
        row.planIndex >= 0 &&
        row.planIndex < 4096 &&
        typeof row.relativePath === 'string'
    ) &&
    Array.isArray(value.filesStatus) &&
    value.filesStatus.every(
      (row) => row && typeof row.relativePath === 'string' && Object.hasOwn(FileStatus, row.status)
    ) &&
    Array.isArray(value.removals) &&
    value.removals.every((entry) => typeof entry === 'string') &&
    (value.deferredError === undefined ||
      (value.deferredError.phase === 'applyModified' && typeof value.deferredError.message === 'string'))
  );
}

function validSelectors(value: Applied, clones: SourceFile[], prepared: PreparedCheckoutFiles): boolean {
  const bodies = new Set(prepared.plan.bodies.map((row) => row.planIndex));
  const paths = new Set([...prepared.plan.targetFiles, ...prepared.plan.currentFiles].map((row) => row.relativePath));
  return (
    value.files.every(
      (row) =>
        bodies.has(row.planIndex) &&
        (row.kind === 'target'
          ? row.index < clones.length && row.relativePath === prepared.targetModels[row.index].relativePath
          : row.index < prepared.plan.currentFiles.length &&
            row.relativePath === prepared.plan.currentFiles[row.index].relativePath)
    ) && value.filesStatus.every((row) => paths.has(row.relativePath))
  );
}

function applySelectors(
  clones: SourceFile[],
  results: MergeResultsThreeWay,
  prepared: PreparedCheckoutFiles,
  applied: Applied
) {
  const modifiedFiles: SourceFile[] = [];
  const currentRows = [
    ...results.modifiedFiles,
    ...results.addFiles,
    ...results.deletedConflictFiles,
    ...results.unModifiedFiles,
  ];
  for (const selection of applied.files) {
    const body = prepared.plan.bodies.find((row) => row.planIndex === selection.planIndex);
    if (!body) throw new Error('checkout retained body selector is missing');
    const file =
      selection.kind === 'target'
        ? clones[selection.index]
        : currentRows.find((row) => row.filePath === selection.relativePath && row.fsFile)?.fsFile;
    if (!file) throw new Error('checkout retained file selector is missing');
    const existing = getRustCheckoutPlanSourceDescriptor(file);
    if (existing?.planIndex !== selection.planIndex) {
      const current = prepared.plan.currentFiles.find((row) => row.planIndex === selection.planIndex);
      const publicFile =
        current && currentRows.find((row) => row.filePath === current.relativePath && row.fsFile)?.fsFile;
      const alias =
        current &&
        Object.getOwnPropertyDescriptor(publicFile || (selection.kind === 'current' ? file : {}), '_contents')?.value;
      if (
        !installRustCheckoutPlanSourceContents(
          file,
          {
            token: prepared.plan.token,
            planIndex: body.planIndex,
            snapshotPath: body.spoolPath,
            snapshotHash: body.spoolHash,
            bytes: body.bytes,
          },
          Buffer.isBuffer(alias) ? alias : undefined
        )
      )
        throw new Error('checkout retained file body could not be installed');
    }
    modifiedFiles.push(file);
  }
  if (applied.deferredError) throw new BitError(applied.deferredError.message);
  const filesStatus = {};
  for (const row of applied.filesStatus) filesStatus[row.relativePath] = FileStatus[row.status];
  return { modifiedFiles, filesStatus };
}

function ordinaryFileStatusMap(statuses: FilesStatus): boolean {
  return (
    !types.isProxy(statuses) &&
    Object.getPrototypeOf(statuses) === Object.prototype &&
    Reflect.ownKeys(statuses).every((key) => 'value' in Object.getOwnPropertyDescriptor(statuses, key)!)
  );
}

/** Preserve the synchronous public fallback while batching ordinary owned file status work. */
export async function updateFileStatusWithRust(
  files: SourceFile[],
  filesStatus: FilesStatus,
  componentFromFS?: ConsumerComponent
): Promise<void> {
  if (
    process.env.BIT_RUST_CLIENT_VCS === 'on' &&
    ordinaryFileStatusMap(filesStatus) &&
    (!componentFromFS || hasRustSnapshotTransactionClassFields(componentFromFS, 'ConsumerComponent', ['files']))
  ) {
    const current = componentFromFS?.files;
    const statuses = await getRustFileStatuses(files, current || []);
    if (
      statuses &&
      ordinaryFileStatusMap(filesStatus) &&
      (!componentFromFS || hasRustSnapshotTransactionClassFields(componentFromFS, 'ConsumerComponent', ['files'])) &&
      componentFromFS?.files === current
    ) {
      for (const row of statuses) {
        filesStatus[pathNormalizeToLinux(row.relativePath)] = (
          row.unchanged ? FileStatus.unchanged : FileStatus.updated
        ) as FilesStatus[string];
      }
      return;
    }
  }
  updateFileStatus(files, filesStatus, componentFromFS);
}

export function updateFileStatus(files: SourceFile[], filesStatus: FilesStatus, componentFromFS?: ConsumerComponent) {
  files.forEach((file) => {
    const fileFromFs = componentFromFS?.files.find((f) => f.relative === file.relative);
    const areFilesEqual =
      fileFromFs &&
      (compareRustCheckoutSource(file, fileFromFs) ?? Buffer.compare(fileFromFs.contents, file.contents) === 0);
    // @ts-ignore
    filesStatus[pathNormalizeToLinux(file.relative)] = areFilesEqual ? FileStatus.unchanged : FileStatus.updated;
  });
}

/**
 * when files exist on the filesystem but not on the checked out versions, they need to be deleted.
 * without this function, these files would be left on the filesystem. (we don't delete the comp-dir before writing).
 * this needs to be done *before* the component is written to the filesystem, otherwise, it won't work when a file
 * has a case change. e.g. from uppercase to lowercase. (see merge-lane.e2e 'renaming files from uppercase to lowercase').
 */
export async function removeFilesIfNeeded(
  filesStatus: FilesStatus,
  consumer: Consumer,
  componentFromFS?: ConsumerComponent,
  checkpoint?: { tracked: boolean }
) {
  if (!componentFromFS) return;
  // @todo: if the component is not in the FS, it should be passed as undefined here.
  // in the case this is coming from merge-lane, it's sometimes populated from the scope.
  const isExistOnFs = checkpoint
    ? checkpoint.tracked
    : consumer.bitMap.getComponentIdIfExist(componentFromFS.id, { ignoreVersion: true });
  if (!isExistOnFs) return;
  const filePathsFromFS = componentFromFS.files || [];
  const dataToPersist = new DataToPersist();
  filePathsFromFS.forEach((file) => {
    const filename = pathNormalizeToLinux(file.relative);
    // the live .bitmap is never deleted from a versioned copy, see isWorkspaceMapFile. only the root
    // component tracks it, an ordinary component's is a file like any other.
    if (isWorkspaceMapFile(filename) && componentFromFS.componentMap?.rootDir === WORKSPACE_ROOT_DIR) return;
    if (!filesStatus[filename]) {
      // @ts-ignore todo: typescript has a good point here. it should be the string "removed", not chalk.green(removed).
      filesStatus[filename] = FileStatus.removed;
    }
    if (filesStatus[filename] === FileStatus.removed) {
      dataToPersist.removePath(new RemovePath(file.path));
    }
  });
  await dataToPersist.persistAllToFS();
}

export function throwForFailures(allComponentsStatus: ComponentStatusBase[]) {
  const failedComponents = allComponentsStatus.filter((c) => c.unchangedMessage && !c.unchangedLegitimately);
  if (failedComponents.length) {
    const failureMsgs = failedComponents
      .map(
        (failedComponent) =>
          `${chalk.bold(failedComponent.id.toString())} - ${chalk.red(failedComponent.unchangedMessage as string)}`
      )
      .join('\n');
    throw new BitError(`unable to proceed due to the following failures:\n${failureMsgs}`);
  }
}
