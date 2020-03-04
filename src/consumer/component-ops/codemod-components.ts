import Component from '../component/consumer-component';
import { SourceFile } from '../component/sources';
import { RelativeComponentsAuthoredEntry } from '../component/dependencies/dependency-resolver/dependencies-resolver';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import replacePackageName from '../../utils/string/replace-package-name';
import DataToPersist from '../component/sources/data-to-persist';
import { BitId } from '../../bit-id';

export type CodemodResult = {
  id: BitId;
  changedFiles: string[];
};

// eslint-disable-next-line import/prefer-default-export
export async function changeCodeFromRelativeToModulePaths(components: Component[]): Promise<CodemodResult[]> {
  const componentsWithRelativeIssues = components.filter(c => c.issues && c.issues.relativeComponentsAuthored);
  const dataToPersist = new DataToPersist();
  const codemodResults = componentsWithRelativeIssues.map(component => {
    const componentDataToMerge = codemodComponent(component);
    dataToPersist.merge(componentDataToMerge);
    return { id: component.id, changedFiles: componentDataToMerge.files.map(f => f.relative) };
  });
  await dataToPersist.persistAllToFS();
  return codemodResults.filter(c => c.changedFiles.length);
}

function codemodComponent(component: Component): DataToPersist {
  const dataToPersist = new DataToPersist();
  const issues = component.issues;
  if (!issues || !issues.relativeComponentsAuthored) return dataToPersist;
  component.files.forEach((file: SourceFile) => {
    const relativeInstances = issues.relativeComponentsAuthored[file.relative];
    if (!relativeInstances) return;
    // @ts-ignore
    const fileBefore = file.contents.toString() as string;
    let newFileString = fileBefore;

    relativeInstances.forEach((relativeEntry: RelativeComponentsAuthoredEntry) => {
      const id = relativeEntry.componentId;
      const packageName = componentIdToPackageName(id, component.bindingPrefix, component.defaultScope);
      newFileString = replacePackageName(newFileString, relativeEntry.importSource, packageName);
    });
    if (fileBefore !== newFileString) {
      // @ts-ignore
      file.contents = Buffer.from(newFileString);
      dataToPersist.addFile(file);
    }
  });
  return dataToPersist;
}
