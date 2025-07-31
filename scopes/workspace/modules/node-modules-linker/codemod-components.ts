import path from 'path';
import type { Workspace } from '@teambit/workspace';
import type { RelativeComponentsAuthoredEntry } from '@teambit/component-issues';
import { IssuesClasses } from '@teambit/component-issues';
import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { pathJoinLinux, pathNormalizeToLinux, pathRelativeLinux, replacePackageName } from '@teambit/legacy.utils';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import type { SourceFile } from '@teambit/component.sources';
import { DataToPersist } from '@teambit/component.sources';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';

export type CodemodResult = {
  id: ComponentID;
  changedFiles: string[];
  warnings?: string[];
};

export async function changeCodeFromRelativeToModulePaths(
  workspace: Workspace,
  bitIds: ComponentID[]
): Promise<CodemodResult[]> {
  const components = await loadComponents(workspace, bitIds);
  const componentsWithRelativeIssues = components.filter(
    (c) => c.state.issues && c.state.issues.getIssue(IssuesClasses.RelativeComponentsAuthored)
  );
  const dataToPersist = new DataToPersist();
  const codemodResults = await Promise.all(
    componentsWithRelativeIssues.map(async (component) => {
      const { files, warnings } = await codemodComponent(workspace, component);
      dataToPersist.addManyFiles(files);
      return { id: component.id, changedFiles: files.map((f) => f.relative), warnings };
    })
  );
  await dataToPersist.persistAllToFS();
  const idsToReload = codemodResults.filter((c) => !c.warnings || c.warnings.length === 0).map((c) => c.id);
  await reloadComponents(workspace, idsToReload);

  return codemodResults.filter((c) => c.changedFiles.length || c.warnings);
}

async function reloadComponents(workspace: Workspace, compIds: ComponentID[]) {
  workspace.clearAllComponentsCache();
  if (!compIds.length) return;
  const components = await loadComponents(workspace, compIds);
  const componentsWithRelativeIssues = components.filter(
    (c) => c.state.issues && c.state.issues.getIssue(IssuesClasses.RelativeComponentsAuthored)
  );
  if (componentsWithRelativeIssues.length) {
    const failedComps = componentsWithRelativeIssues.map((c) => c.id.toString()).join(', ');
    throw new Error(`failed rewiring the following components: ${failedComps}`);
  }
}

async function loadComponents(workspace: Workspace, bitIds: ComponentID[]): Promise<Component[]> {
  const componentsIds = bitIds.length ? ComponentIdList.fromArray(bitIds) : await workspace.listIds();
  const components = await workspace.getMany(componentsIds);

  return components;
}

async function codemodComponent(
  workspace: Workspace,
  component: Component
): Promise<{ files: SourceFile[]; warnings?: string[] }> {
  const issues = component.state.issues;
  const files: SourceFile[] = [];
  if (!issues || !issues.getIssue(IssuesClasses.RelativeComponentsAuthored)) return { files };
  const warnings: string[] = [];
  await Promise.all(
    component.filesystem.files.map(async (file: SourceFile) => {
      const relativeInstances = issues.getIssue(IssuesClasses.RelativeComponentsAuthored)?.data[
        pathNormalizeToLinux(file.relative)
      ];
      if (!relativeInstances) return;
      // @ts-ignore
      const fileBefore = file.contents.toString() as string;
      let newFileString = fileBefore;
      await Promise.all(
        relativeInstances.map(async (relativeEntry: RelativeComponentsAuthoredEntry) => {
          const id = relativeEntry.componentId;
          const requiredComponent = await workspace.get(id);
          const consumerComp = requiredComponent.state._consumer as ConsumerComponent;
          const packageName = componentIdToPackageName({ ...consumerComp, id });
          const cssFamily = ['.css', '.scss', '.less', '.sass'];
          const isCss = cssFamily.includes(file.extname);
          const packageNameSupportCss = isCss ? `~${packageName}` : packageName;
          const stringToReplace = getNameWithoutInternalPath(workspace, relativeEntry);
          // @todo: the "dist" should be replaced by the compiler dist-dir.
          // newFileString = replacePackageName(newFileString, stringToReplace, packageNameSupportCss, 'dist');
          newFileString = replacePackageName(newFileString, stringToReplace, packageNameSupportCss);
        })
      );
      if (fileBefore !== newFileString) {
        // @ts-ignore
        file.contents = Buffer.from(newFileString);
        files.push(file);
      }
    })
  );
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
function getNameWithoutInternalPath(workspace: Workspace, relativeEntry: RelativeComponentsAuthoredEntry): string {
  const importSource = relativeEntry.importSource;
  const componentMap = workspace.consumer.bitMap.getComponentIfExist(relativeEntry.componentId);
  if (!componentMap) return importSource;
  const rootDir = componentMap.rootDir;
  if (!rootDir) return importSource;
  const mainFile = pathJoinLinux(rootDir, componentMap.mainFile);
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
