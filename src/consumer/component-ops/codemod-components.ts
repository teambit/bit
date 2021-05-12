import path from 'path';
import { IssuesClasses, RelativeComponentsAuthoredEntry } from '@teambit/component-issues';
import { Consumer } from '..';
import { BitId, BitIds } from '../../bit-id';
import { pathJoinLinux, pathNormalizeToLinux, pathRelativeLinux } from '../../utils';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import replacePackageName from '../../utils/string/replace-package-name';
import Component from '../component/consumer-component';
import { ImportSpecifier } from '../component/dependencies/files-dependency-builder/types/dependency-tree-type';
import { SourceFile } from '../component/sources';
import DataToPersist from '../component/sources/data-to-persist';

export type CodemodResult = {
  id: BitId;
  changedFiles: string[];
  warnings?: string[];
};

export async function changeCodeFromRelativeToModulePaths(
  consumer: Consumer,
  bitIds: BitId[]
): Promise<CodemodResult[]> {
  const components = await loadComponents(consumer, bitIds);
  const componentsWithRelativeIssues = components.filter(
    (c) => c.issues && c.issues.getIssue(IssuesClasses.relativeComponentsAuthored)
  );
  const dataToPersist = new DataToPersist();
  const codemodResults = componentsWithRelativeIssues.map((component) => {
    const { files, warnings } = codemodComponent(consumer, component);
    dataToPersist.addManyFiles(files);
    return { id: component.id, changedFiles: files.map((f) => f.relative), warnings };
  });
  await dataToPersist.persistAllToFS();
  const idsToReload = codemodResults.filter((c) => !c.warnings || c.warnings.length === 0).map((c) => c.id);
  await reloadComponents(consumer, idsToReload);

  return codemodResults.filter((c) => c.changedFiles.length || c.warnings);
}

async function reloadComponents(consumer: Consumer, bitIds: BitId[]) {
  consumer.clearCache();
  if (!bitIds.length) return;
  const components = await loadComponents(consumer, bitIds);
  const componentsWithRelativeIssues = components.filter(
    (c) => c.issues && c.issues.getIssue(IssuesClasses.relativeComponentsAuthored)
  );
  if (componentsWithRelativeIssues.length) {
    const failedComps = componentsWithRelativeIssues.map((c) => c.id.toString()).join(', ');
    throw new Error(`failed rewiring the following components: ${failedComps}`);
  }
}

async function loadComponents(consumer: Consumer, bitIds: BitId[]): Promise<Component[]> {
  const componentsIds = bitIds.length ? BitIds.fromArray(bitIds) : consumer.bitmapIdsFromCurrentLane;
  const { components } = await consumer.loadComponents(componentsIds);

  return components;
}

function codemodComponent(consumer: Consumer, component: Component): { files: SourceFile[]; warnings?: string[] } {
  const issues = component.issues;
  const files: SourceFile[] = [];
  if (!issues || !issues.getIssue(IssuesClasses.relativeComponentsAuthored)) return { files };
  const warnings: string[] = [];
  component.files.forEach((file: SourceFile) => {
    const relativeInstances = issues.getIssue(IssuesClasses.relativeComponentsAuthored)?.data[
      pathNormalizeToLinux(file.relative)
    ];
    if (!relativeInstances) return;
    // @ts-ignore
    const fileBefore = file.contents.toString() as string;
    let newFileString = fileBefore;
    relativeInstances.forEach((relativeEntry: RelativeComponentsAuthoredEntry) => {
      const id = relativeEntry.componentId;
      if (isLinkFileHasDifferentImportType(relativeEntry.relativePath.importSpecifiers)) {
        warnings.push(
          `"${file.relative}" requires "${id.toString()}" through a link-file ("${
            relativeEntry.importSource
          }") and not directly, which makes it difficult change the import, please change your code to require the component directly`
        );
        return;
      }
      const packageName = componentIdToPackageName({ ...component, id });
      const cssFamily = ['.css', '.scss', '.less', '.sass'];
      const isCss = cssFamily.includes(file.extname);
      const packageNameSupportCss = isCss ? `~${packageName}` : packageName;
      const stringToReplace = getNameWithoutInternalPath(consumer, relativeEntry);
      // @todo: the "dist" should be replaced by the compiler dist-dir.
      // newFileString = replacePackageName(newFileString, stringToReplace, packageNameSupportCss, 'dist');
      newFileString = replacePackageName(newFileString, stringToReplace, packageNameSupportCss);
    });
    if (fileBefore !== newFileString) {
      // @ts-ignore
      file.contents = Buffer.from(newFileString);
      files.push(file);
    }
  });
  return { files, warnings };
}

/**
 * e.g.
 * importSource: '../workspace/workspace.ui'
 * sourceRelativePath: 'extensions/workspace/workspace.ui.tsx'
 * rootDir in .bitmap: 'extensions/workspace'.
 *
 * expected to return "../workspace", as this is the path to the package root without the internal path.
 *
 * eventually, only this string is replaced by the new package-name and the internal-path part
 * remains intact. ('../workspace/workspace.ui' => '@bit/workspace/workspace.ui').
 */
function getNameWithoutInternalPath(consumer: Consumer, relativeEntry: RelativeComponentsAuthoredEntry): string {
  const importSource = relativeEntry.importSource;
  const componentMap = consumer.bitMap.getComponentIfExist(relativeEntry.componentId);
  if (!componentMap) return importSource;
  const rootDir = componentMap.trackDir || componentMap.rootDir;
  if (!rootDir) return importSource;
  const mainFile = componentMap.trackDir ? componentMap.mainFile : pathJoinLinux(rootDir, componentMap.mainFile);
  const filePathRelativeToWorkspace = relativeEntry.relativePath.sourceRelativePath;
  if (filePathRelativeToWorkspace === mainFile) {
    return importSource;
  }
  // the importSource is not the main-file but an internal file, remove the internal part.
  const internalPath = pathRelativeLinux(rootDir, filePathRelativeToWorkspace);
  const removeLastOccurrence = (str, toRemove) => str.replace(new RegExp(`/${toRemove}$`), '');
  if (importSource.endsWith(internalPath)) {
    return removeLastOccurrence(importSource, internalPath);
  }
  const internalPathNoExt = internalPath.replace(path.extname(internalPath), '');
  if (importSource.endsWith(internalPathNoExt)) {
    return removeLastOccurrence(importSource, internalPathNoExt);
  }
  const internalPathNoIndex = removeLastOccurrence(internalPathNoExt, 'index');
  if (importSource.endsWith(internalPathNoIndex)) {
    return removeLastOccurrence(importSource, internalPathNoIndex);
  }

  // unable to find anything useful. just return the importSource.
  return importSource;
}

/**
 * if this is a link-file (a file that only import and export other files), bit doesn't require
 * the user to track it and it knows to skip it. If however, the link file uses default import and
 * the real file uses non-default, or vice versa, the codemod will result in an incorrect import
 * statement, and won't work.
 */
function isLinkFileHasDifferentImportType(importSpecifiers?: ImportSpecifier[]) {
  if (!importSpecifiers) return false;
  return importSpecifiers.some((importSpecifier) => {
    if (!importSpecifier.linkFile) return false;
    return importSpecifier.linkFile.isDefault !== importSpecifier.mainFile.isDefault;
  });
}
