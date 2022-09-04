import { compact } from 'lodash';
import * as path from 'path';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';
import { ComponentWithDependencies } from '../../scope';
import Version from '../../scope/models/version';
import { pathNormalizeToLinux, PathOsBased } from '../../utils/path';
import ConsumerComponent from '../component';
import { SourceFile } from '../component/sources';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import { ApplyVersionResult, FileStatus, MergeOptions, MergeStrategy } from './merge-version';
import { MergeResultsThreeWay } from './merge-version/three-way-merge';

export type CheckoutProps = {
  version?: string; // if reset is true, the version is undefined
  ids?: BitId[];
  latestVersion?: boolean;
  promptMergeOptions?: boolean;
  mergeStrategy?: MergeStrategy | null;
  verbose?: boolean;
  skipNpmInstall?: boolean;
  ignorePackageJson?: boolean;
  writeConfig?: boolean;
  reset?: boolean; // remove local changes. if set, the version is undefined.
  all?: boolean; // checkout all ids
  ignoreDist?: boolean;
  isLane?: boolean;
};
export type ComponentStatus = {
  componentFromFS?: ConsumerComponent;
  componentFromModel?: Version;
  id: BitId;
  failureMessage?: string;
  unchangedLegitimately?: boolean; // failed to checkout but for a legitimate reason, such as, up-to-date
  mergeResults?: MergeResultsThreeWay | null | undefined;
};

type ApplyVersionWithComps = { applyVersionResult: ApplyVersionResult; component?: ComponentWithDependencies };

/**
 * 1) when the files are modified with conflicts and the strategy is "ours", leave the FS as is
 * and update only bitmap id version. (not the componentMap object).
 *
 * 2) when the files are modified with conflicts and the strategy is "theirs", write the component
 * according to id.version.
 *
 * 3) when files are modified with no conflict or files are modified with conflicts and the
 * strategy is manual, load the component according to id.version and update component.files.
 * applyModifiedVersion() docs explains what files are updated/added.
 *
 * 4) when --reset flag is used, write the component according to the bitmap version
 *
 * Side note:
 * Deleted file => if files are in used version but not in the modified one, no need to delete it. (similar to git).
 * Added file => if files are not in used version but in the modified one, they'll be under mergeResults.addFiles
 */
export async function applyVersion(
  consumer: Consumer,
  id: BitId,
  componentFromFS: ConsumerComponent | null | undefined, // it can be null only when isLanes is true
  mergeResults: MergeResultsThreeWay | null | undefined,
  checkoutProps: CheckoutProps
): Promise<ApplyVersionWithComps> {
  if (!checkoutProps.isLane && !componentFromFS)
    throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
  const { mergeStrategy } = checkoutProps;
  let filesStatus = {};
  if (mergeResults && mergeResults.hasConflicts && mergeStrategy === MergeOptions.ours) {
    // even when isLane is true, the mergeResults is possible only when the component is on the filesystem
    // otherwise it's impossible to have conflicts
    if (!componentFromFS) throw new Error(`applyVersion expect to get componentFromFS for ${id.toString()}`);
    componentFromFS.files.forEach((file) => {
      filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.unchanged;
    });
    consumer.bitMap.updateComponentId(id);
    return { applyVersionResult: { id, filesStatus } };
  }
  const componentWithDependencies = await consumer.loadComponentWithDependenciesFromModel(id);
  const componentMap = componentFromFS && componentFromFS.componentMap;
  if (componentFromFS && !componentMap) throw new GeneralError('applyVersion: componentMap was not found');
  if (componentMap && !id.scope) {
    componentWithDependencies.dependencies = [];
    componentWithDependencies.devDependencies = [];
  }
  const files = componentWithDependencies.component.files;
  files.forEach((file) => {
    filesStatus[pathNormalizeToLinux(file.relative)] = FileStatus.updated;
  });
  if (mergeResults) {
    // update files according to the merge results
    const { filesStatus: modifiedStatus, modifiedFiles } = applyModifiedVersion(files, mergeResults, mergeStrategy);
    filesStatus = { ...filesStatus, ...modifiedStatus };
    componentWithDependencies.component.files = modifiedFiles;
  }
  const shouldDependenciesSaveAsComponents = await consumer.shouldDependenciesSavedAsComponents([id]);
  componentWithDependencies.component.dependenciesSavedAsComponents =
    shouldDependenciesSaveAsComponents[0].saveDependenciesAsComponents;

  return {
    applyVersionResult: { id, filesStatus },
    component: componentWithDependencies,
  };
}

/**
 * relevant only when
 * 1) there is no conflict => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.output.
 * 2) there is conflict and mergeStrategy is manual => add files from mergeResults: addFiles, overrideFiles and modifiedFiles.conflict.
 *
 * this function only updates the files content, it doesn't write the files
 */
export function applyModifiedVersion(
  componentFiles: SourceFile[],
  mergeResults: MergeResultsThreeWay,
  mergeStrategy: MergeStrategy | null | undefined
): { filesStatus: Record<string, any>; modifiedFiles: SourceFile[] } {
  let modifiedFiles = componentFiles.map((file) => file.clone());
  const filesStatus = {};
  if (mergeResults.hasConflicts && mergeStrategy !== MergeOptions.manual) {
    return { filesStatus, modifiedFiles };
  }
  mergeResults.modifiedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    if (file.conflict) {
      foundFile.contents = Buffer.from(file.conflict);
      filesStatus[file.filePath] = FileStatus.manual;
    } else if (file.output) {
      foundFile.contents = Buffer.from(file.output);
      filesStatus[file.filePath] = FileStatus.merged;
    } else if (file.isBinaryConflict) {
      // leave the file as is and notify the user later about it.
      foundFile.contents = file.fsFile.contents;
      filesStatus[file.filePath] = FileStatus.binaryConflict;
    } else {
      throw new GeneralError(`file ${filePath} does not have output nor conflict`);
    }
  });

  mergeResults.addFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    if (modifiedFiles.find((m) => m.relative === filePath)) return;
    modifiedFiles.push(file.fsFile);
    filesStatus[file.filePath] = FileStatus.added;
  });
  mergeResults.removeFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    filesStatus[file.filePath] = FileStatus.removed;
    modifiedFiles = modifiedFiles.filter((f) => f.relative !== filePath);
  });
  mergeResults.remainDeletedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    modifiedFiles = modifiedFiles.filter((f) => f.relative !== filePath);
    filesStatus[file.filePath] = FileStatus.remainDeleted;
  });
  mergeResults.overrideFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.fsFile.contents;
    filesStatus[file.filePath] = FileStatus.overridden;
  });
  mergeResults.updatedFiles.forEach((file) => {
    const filePath: PathOsBased = path.normalize(file.filePath);
    const foundFile = modifiedFiles.find((componentFile) => componentFile.relative === filePath);
    if (!foundFile) throw new GeneralError(`file ${filePath} not found`);
    foundFile.contents = file.content;
    filesStatus[file.filePath] = FileStatus.updated;
  });

  return { filesStatus, modifiedFiles };
}

/**
 * when files exist on the filesystem but not on the checked out versions, they need to be deleted.
 * this function only mark them as such. later `deleteFilesIfNeeded()` will delete them
 */
export function markFilesToBeRemovedIfNeeded(
  succeededComponents: ComponentStatus[],
  componentsResults: ApplyVersionWithComps[]
) {
  const succeededComponentsByBitId: { [K in string]: ComponentStatus } = succeededComponents.reduce((accum, next) => {
    const bitId = next.id.toString();
    if (!accum[bitId]) accum[bitId] = next;
    return accum;
  }, {});

  componentsResults.forEach((componentResult) => {
    const existingFilePathsFromModel = componentResult.applyVersionResult.filesStatus;
    const bitId = componentResult.applyVersionResult.id.toString();
    const succeededComponent = succeededComponentsByBitId[bitId];
    const filePathsFromFS = succeededComponent.componentFromFS?.files || [];

    filePathsFromFS.forEach((file) => {
      const filename = pathNormalizeToLinux(file.relative);
      if (!existingFilePathsFromModel[filename]) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        existingFilePathsFromModel[filename] = FileStatus.removed;
      }
    });
  });
}

/**
 * it's needed in case the checked out version removed files that exist on the current version.
 * without this function, these files would be left on the filesystem.
 */
export async function deleteFilesIfNeeded(
  componentsResults: ApplyVersionWithComps[],
  consumer: Consumer
): Promise<void> {
  const pathsToRemoveIncludeNull = componentsResults.map((compResult) => {
    return Object.keys(compResult.applyVersionResult.filesStatus).map((filePath) => {
      if (compResult.applyVersionResult.filesStatus[filePath] === FileStatus.removed) {
        if (!compResult.component?.component.writtenPath) return null;
        return path.join(compResult.component?.component.writtenPath, filePath);
      }
      return null;
    });
  });
  const pathsToRemove = compact(pathsToRemoveIncludeNull.flat());
  const dataToPersist = new DataToPersist();
  dataToPersist.removeManyPaths(pathsToRemove.map((p) => new RemovePath(p, true)));
  dataToPersist.addBasePath(consumer.getPath());
  await dataToPersist.persistAllToFS();
}
