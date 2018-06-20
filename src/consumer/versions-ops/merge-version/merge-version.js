// @flow
import path from 'path';
import chalk from 'chalk';
import { BitId } from '../../../bit-id';
import Component from '../../component';
import { Version } from '../../../scope/models';
import { Consumer } from '../..';
import { SourceFile } from '../../component/sources';
import type { SourceFileModel } from '../../../scope/models/version';
import { resolveConflictPrompt } from '../../../prompts';
import { pathNormalizeToLinux } from '../../../utils/path';
import twoWayMergeVersions from './two-way-merge';
import type { MergeResultsTwoWay } from './two-way-merge';
import type { PathLinux, PathOsBased } from '../../../utils/path';
import { COMPONENT_ORIGINS } from '../../../constants';
import GeneralError from '../../../error/general-error';
import ComponentMap from '../../bit-map/component-map';

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
  const { components } = await consumer.loadComponents(ids);
  const componentsStatusP = components.map((component: Component) => {
    return getComponentStatus(consumer, component, version);
  });
  const componentsStatus = await Promise.all(componentsStatusP);
  const componentWithConflict = componentsStatus.find(component => component.mergeResults.hasConflicts);
  if (componentWithConflict && !mergeStrategy) {
    mergeStrategy = await getMergeStrategyInteractive();
  }
  const mergedComponentsP = componentsStatus.map(({ id, componentFromFS, mergeResults }) => {
    return applyVersion(consumer, id, componentFromFS, mergeResults, mergeStrategy);
  });
  const mergedComponents = await Promise.all(mergedComponentsP);

  return { components: mergedComponents, version };
}

async function getComponentStatus(consumer: Consumer, component: Component, version: string): Promise<ComponentStatus> {
  const componentModel = await consumer.scope.sources.get(component.id);
  if (!componentModel) {
    throw new GeneralError(`component ${component.id.toString()} doesn't have any version yet`);
  }
  if (!componentModel.hasVersion(version)) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} doesn't have version ${version}`);
  }
  const existingBitMapId = consumer.bitMap.getExistingComponentId(component.id.toStringWithoutVersion());
  const currentlyUsedVersion = BitId.parse(existingBitMapId).version;
  if (currentlyUsedVersion === version) {
    throw new GeneralError(`component ${component.id.toStringWithoutVersion()} is already at version ${version}`);
  }
  const otherComponent: Version = await componentModel.loadVersion(version, consumer.scope.objects);
  const mergeResults: MergeResultsTwoWay = await twoWayMergeVersions({
    consumer,
    otherComponent,
    otherVersion: version,
    currentComponent: component,
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
  const files = componentFromFS.cloneFilesWithSharedDir();
  component.files = files;

  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
  });

  // update files according to the merge results
  const modifiedStatus = await applyModifiedVersion(consumer, files, mergeResults, mergeStrategy);

  if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED) {
    component.originallySharedDir = componentMap.originallySharedDir || null;
    component.stripOriginallySharedDir(consumer.bitMap);
  }

  await component.write({
    override: true,
    writeBitJson: false, // never override the existing bit.json
    writePackageJson: false,
    deleteBitDirContent: false,
    origin: componentMap.origin,
    consumer,
    componentMap
  });

  consumer.bitMap.removeComponent(component.id);
  component._addComponentToBitMap(consumer.bitMap, componentMap.rootDir, componentMap.origin);

  const filesStatusNoSharedDir = filesStatusWithoutSharedDir(filesStatus, component, componentMap);
  const modifiedStatusNoSharedDir = filesStatusWithoutSharedDir(modifiedStatus, component, componentMap);

  return { id, filesStatus: Object.assign(filesStatusNoSharedDir, modifiedStatusNoSharedDir) };
}

async function applyModifiedVersion(
  consumer: Consumer,
  componentFiles: SourceFile[],
  mergeResults: MergeResultsTwoWay,
  mergeStrategy: ?MergeStrategy
): Promise<Object> {
  const filesStatus = {};
  const modifiedP = mergeResults.modifiedFiles.map(async (file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = componentFiles.find(componentFile => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (mergeResults.hasConflicts && mergeStrategy === MergeOptions.theirs) {
      // write the version of otherFile
      const otherFile: SourceFileModel = file.otherFile;
      // $FlowFixMe
      const content = await otherFile.file.load(consumer.scope.objects);
      foundFile.contents = content.contents;
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
  const addFilesP = mergeResults.addFiles.map(async (file) => {
    const otherFile: SourceFileModel = file.otherFile;
    const newFile = await SourceFile.loadFromSourceFileModel(otherFile, consumer.scope.objects);
    componentFiles.push(newFile);
    filesStatus[file.filePath] = FileStatus.added;
  });

  await Promise.all([Promise.all(modifiedP), Promise.all(addFilesP)]);

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

export function filesStatusWithoutSharedDir(
  filesStatus: FilesStatus,
  component: Component,
  componentMap: ComponentMap
): FilesStatus {
  if (componentMap.origin !== COMPONENT_ORIGINS.IMPORTED) return filesStatus;
  component.setOriginallySharedDir();
  if (!component.originallySharedDir) return filesStatus;
  const sharedDir = component.originallySharedDir;
  const fileWithoutSharedDir = (file: PathLinux): PathLinux => file.replace(`${sharedDir}/`, '');
  return Object.keys(filesStatus).reduce((acc, file) => {
    acc[fileWithoutSharedDir(file)] = filesStatus[file];
    return acc;
  }, {});
}
