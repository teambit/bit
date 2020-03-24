import Component from '../component/consumer-component';
import { SourceFile } from '../component/sources';
import { RelativeComponentsAuthoredEntry } from '../component/dependencies/dependency-resolver/dependencies-resolver';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import replacePackageName from '../../utils/string/replace-package-name';
import DataToPersist from '../component/sources/data-to-persist';
import { BitId, BitIds } from '../../bit-id';
import { pathNormalizeToLinux } from '../../utils';
import { ImportSpecifier } from '../component/dependencies/dependency-resolver/types/dependency-tree-type';
import { Consumer } from '..';
import IncorrectRootDir from '../component/exceptions/incorrect-root-dir';

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
  const componentsWithRelativeIssues = components.filter(c => c.issues && c.issues.relativeComponentsAuthored);
  const dataToPersist = new DataToPersist();
  const codemodResults = componentsWithRelativeIssues.map(component => {
    const { files, warnings } = codemodComponent(component);
    dataToPersist.addManyFiles(files);
    return { id: component.id, changedFiles: files.map(f => f.relative), warnings };
  });
  await dataToPersist.persistAllToFS();
  return codemodResults.filter(c => c.changedFiles.length || c.warnings);
}

async function loadComponents(consumer: Consumer, bitIds: BitId[]): Promise<Component[]> {
  const componentsIds = bitIds.length ? BitIds.fromArray(bitIds) : consumer.bitmapIds;
  const { components, invalidComponents } = await consumer.loadComponents(componentsIds, false);
  invalidComponents.forEach(invalidComp => {
    if (invalidComp.error instanceof IncorrectRootDir) components.push(invalidComp.component as Component);
    else throw invalidComp.error;
  });
  return components;
}

function codemodComponent(component: Component): { files: SourceFile[]; warnings?: string[] } {
  const issues = component.issues;
  const files: SourceFile[] = [];
  if (!issues || !issues.relativeComponentsAuthored) return { files };
  const warnings: string[] = [];
  component.files.forEach((file: SourceFile) => {
    const relativeInstances = issues.relativeComponentsAuthored[pathNormalizeToLinux(file.relative)];
    if (!relativeInstances) return;
    // @ts-ignore
    const fileBefore = file.contents.toString() as string;
    let newFileString = fileBefore;
    relativeInstances.forEach((relativeEntry: RelativeComponentsAuthoredEntry) => {
      const id = relativeEntry.componentId;
      if (isLinkFileHasDifferentImportType(relativeEntry.importSpecifiers)) {
        warnings.push(
          `"${file.relative}" requires "${id.toString()}" through a link-file ("${
            relativeEntry.importSource
          }") and not directly, which makes it difficult change the import, please change your code to require the component directly`
        );
        return;
      }
      const packageName = componentIdToPackageName(id, component.bindingPrefix, component.defaultScope);
      const cssFamily = ['.css', '.scss', '.less', '.sass'];
      const isCss = cssFamily.includes(file.extname);
      const packageNameSupportCss = isCss ? `~${packageName}` : packageName;
      newFileString = replacePackageName(newFileString, relativeEntry.importSource, packageNameSupportCss);
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
 * if this is a link-file (a file that only import and export other files), bit doesn't require
 * the user to track it and it knows to skip it. If however, the link file uses default import and
 * the real file uses non-default, or vice versa, the codemod will result in an incorrect import
 * statement, and won't work.
 */
function isLinkFileHasDifferentImportType(importSpecifiers?: ImportSpecifier[]) {
  if (!importSpecifiers) return false;
  return importSpecifiers.some(importSpecifier => {
    if (!importSpecifier.linkFile) return false;
    return importSpecifier.linkFile.isDefault !== importSpecifier.mainFile.isDefault;
  });
}
