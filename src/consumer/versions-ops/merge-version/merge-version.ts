import chalk from 'chalk';
import * as path from 'path';

import { BitId, BitIds } from '../../../bit-id';
import GeneralError from '../../../error/general-error';
import { resolveConflictPrompt } from '../../../prompts';
import { AutoTagResult } from '../../../scope/component-ops/auto-tag';
import { Tmp } from '../../../scope/repositories';
import { pathNormalizeToLinux, PathOsBased } from '../../../utils/path';
import ComponentWriter from '../../component-ops/component-writer';
import Component from '../../component/consumer-component';
import SourceFile from '../../component/sources/source-file';
import Consumer from '../../consumer';
import twoWayMergeVersions, { MergeResultsTwoWay } from './two-way-merge';

export const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export type MergeStrategy = keyof typeof MergeOptions;
export const FileStatus = {
  merged: chalk.green('auto-merged'),
  manual: chalk.red('CONFLICT'),
  updated: chalk.green('updated'),
  added: chalk.green('added'),
  removed: chalk.green('removed'),
  overridden: chalk.yellow('overridden'),
  unchanged: chalk.green('unchanged'),
};
// fileName is PathLinux. TS doesn't let anything else in the keys other than string and number
export type FilesStatus = { [fileName: string]: keyof typeof FileStatus };
export type ApplyVersionResult = { id: BitId; filesStatus: FilesStatus };
export type FailedComponents = { id: BitId; failureMessage: string; unchangedLegitimately?: boolean };
export type ApplyVersionResults = {
  components?: ApplyVersionResult[];
  version?: string;
  failedComponents?: FailedComponents[];
  resolvedComponents?: Component[]; // relevant for bit merge --resolve
  abortedComponents?: ApplyVersionResult[]; // relevant for bit merge --abort
  mergeSnapResults?: { snappedComponents: Component[]; autoSnappedResults: AutoTagResult[] } | null;
};
type ComponentStatus = {
  componentFromFS: Component;
  id: BitId;
  mergeResults: MergeResultsTwoWay;
};

export async function mergeVersion(
  consumer: Consumer,
  version: string,
  ids: BitId[],
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResults> {
  const { components } = await consumer.loadComponents(BitIds.fromArray(ids));
  const allComponentsStatus = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find((component) => component.mergeResults.hasConflicts);
  if (componentWithConflict && !mergeStrategy) {
    mergeStrategy = await getMergeStrategyInteractive();
  }
  const mergedComponentsP = allComponentsStatus.map(({ id, componentFromFS, mergeResults }) => {
    return applyVersion(consumer, id, componentFromFS, mergeResults, mergeStrategy);
  });
  const mergedComponents = await Promise.all(mergedComponentsP);

  return { components: mergedComponents, version };

  async function getAllComponentsStatus(): Promise<ComponentStatus[]> {
    const tmp = new Tmp(consumer.scope);
    try {
      const componentsStatus = await Promise.all(
        components.map((component) => getComponentStatus(consumer, component, version))
      );
      await tmp.clear();
      return componentsStatus;
    } catch (err) {
      await tmp.clear();
      throw err;
    }
  }
}

async function getComponentStatus(consumer: Consumer, component: Component, version: string): Promise<ComponentStatus> {
  const componentModel = await consumer.scope.getModelComponentIfExist(component.id);
  if (!componentModel) {
    throw new GeneralError(`component ${component.id.toString()} doesn't have any version yet`);
  }
  const hasVersion = await componentModel.hasVersion(version, consumer.scope.objects);
  if (!hasVersion) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
  const currentlyUsedVersion = existingBitMapId.version;
  if (currentlyUsedVersion === version) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
  }
  const unmerged = consumer.scope.objects.unmergedComponents.getEntry(component.name);
  if (unmerged && unmerged.resolved === false) {
    throw new GeneralError(
      `component ${component.id.toStringWithoutVersion()} has conflicts that need to be resolved first, please use bit merge --resolve/--abort`
    );
  }
  const otherComponent: Component = await consumer.loadComponentFromModel(component.id.changeVersion(version));
  const mergeResults: MergeResultsTwoWay = await twoWayMergeVersions({
    consumer,
    otherComponent,
    otherVersion: version,
    currentComponent: component, // $FlowFixMe
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    currentVersion: currentlyUsedVersion,
  });
  return { componentFromFS: component, id: component.id, mergeResults };
}

/**
 * it doesn't matter whether the component is modified. the idea is to merge the
 * specified version with the current version.
 *
 * 1) when there are conflicts and the strategy is "ours", don't do any change to the component.
 *
 * 2) when there are conflicts and the strategy is "theirs", add all files from the specified
 * version and write the component.
 *
 * 3) when there is no conflict or there are conflicts and the strategy is manual, update
 * component.files.
 *
 * it's going to be 2-way merge:
 * current-file: is the current file.
 * base-file: empty.
 * other-file: the specified version.
 */
async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: Component,
  mergeResults: MergeResultsTwoWay,
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResult> {
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    componentFromFS.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    return { id, filesStatus };
  }
  const component = componentFromFS.componentFromModel;
  if (!component) throw new GeneralError('failed finding the component in the model');
  const componentMap = componentFromFS.componentMap;
  if (!componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  const files = componentFromFS.files;
  component.files = files;

  files.forEach((file) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
  });

  // update files according to the merge results
  const modifiedStatus = applyModifiedVersion(consumer, files, mergeResults, mergeStrategy);
  const componentWriter = ComponentWriter.getInstance({
    component,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    writeToPath: component.files[0].base, // find the current path from the files. (we use the first one but it's the same for all)
    writeConfig: false, // never override the existing bit.json
    writePackageJson: false,
    deleteBitDirContent: false,
    origin: componentMap.origin,
    consumer,
    bitMap: consumer.bitMap,
    existingComponentMap: componentMap,
  });
  await componentWriter.write();

  consumer.bitMap.removeComponent(component.id);
  componentWriter.origin = componentMap.origin;
  componentWriter.addComponentToBitMap(componentMap.rootDir);

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

function applyModifiedVersion(
  consumer: Consumer,
  componentFiles: SourceFile[],
  mergeResults: MergeResultsTwoWay,
  mergeStrategy: MergeStrategy | null | undefined
): Record<string, any> {
  const filesStatus = {};
  mergeResults.modifiedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const foundFile = componentFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.theirs) {
      // write the version of otherFile
      const otherFile: SourceFile = file.otherFile;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      foundFile.contents = otherFile.contents;
      filesStatus[file.filePath] = FileStatus.updated;
    } else if (file.conflict) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      foundFile.contents = Buffer.from(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else {
      throw new GeneralError('file does not have output nor conflict');
    }
  });
  mergeResults.addFiles.forEach((file) => {
    const otherFile: SourceFile = file.otherFile;
    componentFiles.push(otherFile);
    filesStatus[file.filePath] = FileStatus.added;
  });

  return filesStatus;
}

export async function getMergeStrategyInteractive(): Promise<MergeStrategy> {
  try {
    const result = await resolveConflictPrompt();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return mergeOptionsCli[result.mergeStrategy];
  } catch (err) {
    // probably user clicked ^C
    throw new GeneralError('the action has been canceled');
  }
}

export function getMergeStrategy(ours: boolean, theirs: boolean, manual: boolean): MergeStrategy | null | undefined {
  if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
    throw new GeneralError('please choose only one of the following: ours, theirs or manual');
  }
  if (ours) return MergeOptions.ours as any;
  if (theirs) return MergeOptions.theirs as any;
  if (manual) return MergeOptions.manual as any;
  return null;
}
