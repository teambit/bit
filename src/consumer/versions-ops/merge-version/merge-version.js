// @flow
import path from 'path';
import chalk from 'chalk';
import { BitId, BitIds } from '../../../bit-id';
import type Component from '../../component/consumer-component';
import type Consumer from '../../consumer';
import type SourceFile from '../../component/sources/source-file';
import { resolveConflictPrompt } from '../../../prompts';
import { pathNormalizeToLinux } from '../../../utils/path';
import twoWayMergeVersions from './two-way-merge';
import type { MergeResultsTwoWay } from './two-way-merge';
import type { PathLinux, PathOsBased } from '../../../utils/path';
import GeneralError from '../../../error/general-error';
import ComponentWriter from '../../component-ops/component-writer';
import { Tmp } from '../../../scope/repositories';

export const mergeOptionsCli = { o: 'ours', t: 'theirs', m: 'manual' };
export const MergeOptions = { ours: 'ours', theirs: 'theirs', manual: 'manual' };
export type MergeStrategy = $Keys<typeof MergeOptions>;
export const FileStatus = {
  merged: chalk.green('auto-merged'),
  manual: chalk.red('CONFLICT'),
  updated: chalk.green('updated'),
  added: chalk.green('added'),
  overridden: chalk.yellow('overridden'),
  unchanged: chalk.green('unchanged')
};
export type FilesStatus = { [fileName: PathLinux]: $Values<typeof FileStatus> };
export type ApplyVersionResult = { id: BitId, filesStatus: FilesStatus };
export type FailedComponents = { id: BitId, failureMessage: string };
export type ApplyVersionResults = {
  components?: ApplyVersionResult[],
  version?: string,
  failedComponents?: FailedComponents[]
};
type ComponentStatus = {
  componentFromFS: Component,
  id: BitId,
  mergeResults: MergeResultsTwoWay
};

export async function mergeVersion(
  consumer: Consumer,
  version: string,
  ids: BitId[],
  mergeStrategy: MergeStrategy
): Promise<ApplyVersionResults> {
  const { components } = await consumer.loadComponents(BitIds.fromArray(ids));
  const allComponentsStatus = await getAllComponentsStatus();
  const componentWithConflict = allComponentsStatus.find(component => component.mergeResults.hasConflicts);
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
        components.map(component => getComponentStatus(consumer, component, version))
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
  const componentModel = await consumer.scope.sources.get(component.id);
  if (!componentModel) {
    throw new GeneralError(`component ${component.id.toString()} doesn't have any version yet`);
  }
  if (!componentModel.hasVersion(version)) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getBitId(component.id, { ignoreVersion: true });
  const currentlyUsedVersion = existingBitMapId.version;
  if (currentlyUsedVersion === version) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
  }
  const otherComponent: Component = await consumer.loadComponentFromModel(component.id.changeVersion(version));
  const mergeResults: MergeResultsTwoWay = await twoWayMergeVersions({
    consumer,
    otherComponent,
    otherVersion: version,
    currentComponent: component, // $FlowFixMe
    currentVersion: currentlyUsedVersion
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
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
  });

  // update files according to the merge results
  const modifiedStatus = applyModifiedVersion(consumer, files, mergeResults, mergeStrategy);

  const componentWriter = ComponentWriter.getInstance({
    component,
    writeToPath: component.files[0].base, // find the current path from the files. (we use the first one but it's the same for all)
    writeConfig: false, // never override the existing bit.json
    writePackageJson: false,
    deleteBitDirContent: false,
    origin: componentMap.origin,
    consumer,
    bitMap: consumer.bitMap,
    existingComponentMap: componentMap
  });
  await componentWriter.write();

  consumer.bitMap.removeComponent(component.id);
  componentWriter.origin = componentMap.origin;
  // $FlowFixMe todo: fix this. does configDir should be a string or ConfigDir?
  componentWriter.configDir = componentMap.configDir;
  componentWriter.addComponentToBitMap(componentMap.rootDir);

  return { id, filesStatus: Object.assign(filesStatus, modifiedStatus) };
}

function applyModifiedVersion(
  consumer: Consumer,
  componentFiles: SourceFile[],
  mergeResults: MergeResultsTwoWay,
  mergeStrategy: ?MergeStrategy
): Object {
  const filesStatus = {};
  mergeResults.modifiedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = componentFiles.find(componentFile => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.theirs) {
      // write the version of otherFile
      const otherFile: SourceFile = file.otherFile;
      foundFile.contents = otherFile.contents;
      filesStatus[file.filePath] = FileStatus.updated;
    } else if (file.conflict) {
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
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
    return mergeOptionsCli[result.mergeStrategy];
  } catch (err) {
    // probably user clicked ^C
    throw new GeneralError('the action has been canceled');
  }
}

export function getMergeStrategy(ours: boolean, theirs: boolean, manual: boolean): ?MergeStrategy {
  if ((ours && theirs) || (ours && manual) || (theirs && manual)) {
    throw new GeneralError('please choose only one of the following: ours, theirs or manual');
  }
  if (ours) return MergeOptions.ours;
  if (theirs) return MergeOptions.theirs;
  if (manual) return MergeOptions.manual;
  return null;
}
