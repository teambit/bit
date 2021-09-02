import chalk from 'chalk';
import R from 'ramda';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import { Scope } from '../../scope';
import { ModelComponent, Version } from '../../scope/models';
import diffFiles from '../../utils/diff-files';
import { saveIntoOsTmp } from '../../utils/fs/save-into-os-tmp';
import { PathLinux, PathOsBased } from '../../utils/path';
import Component from '../component/consumer-component';
import { SourceFile } from '../component/sources';
import { diffBetweenComponentsObjects } from './components-object-diff';

type FileDiff = { filePath: string; diffOutput: string };
export type FieldsDiff = { fieldName: string; diffOutput: string };
export type DiffResults = {
  id: BitId;
  hasDiff: boolean;
  filesDiff?: FileDiff[];
  fieldsDiff?: FieldsDiff[] | null | undefined;
};

export type DiffOptions = {
  verbose?: boolean; // whether show internal components diff, such as sourceRelativePath
  formatDepsAsTable?: boolean; // show dependencies output as table
  color?: boolean; // pass this option to git to return a colorful diff, default = true.
};

export default async function componentsDiff(
  consumer: Consumer,
  ids: BitId[],
  version: string | null | undefined,
  toVersion: string | null | undefined,
  diffOpts: DiffOptions
): Promise<DiffResults[]> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const { components } = await consumer.loadComponents(ids);
  if (!components) throw new ShowDoctorError('failed loading the components');

  // try to resolve ids scope of by components array
  const idsWithScope = ids.map((id) => {
    if (!id.scope && components) {
      const foundComponent = components.find((o) => o.name === id.name);
      if (foundComponent) return id.changeScope(foundComponent.scope);
    }
    return id;
  });

  const getResults = (): Promise<DiffResults[]> => {
    if (version && toVersion) {
      return Promise.all(idsWithScope.map((id) => getComponentDiffBetweenVersions(id)));
    }
    if (version) {
      return Promise.all(components.map((component) => getComponentDiffOfVersion(component)));
    }
    return Promise.all(components.map((component) => getComponentDiff(component)));
  };
  const componentsDiffResults = await getResults();
  return componentsDiffResults;

  async function getComponentDiffOfVersion(component: Component): Promise<DiffResults> {
    const diffResult: DiffResults = { id: component.id, hasDiff: false };
    const modelComponent = await consumer.scope.getModelComponentIfExist(component.id);
    if (!modelComponent) {
      throw new GeneralError(`component ${component.id.toString()} doesn't have any version yet`);
    }
    const repository = consumer.scope.objects;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
    const versionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
    const fsFiles = component.files;
    // $FlowFixMe version must be defined as the component.componentFromModel do exist
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const versionB: string = component.id.version;
    // this function gets called only when version is set
    diffResult.filesDiff = await getFilesDiff(versionFiles, fsFiles, version as string, versionB);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fromVersionComponent = await modelComponent.toConsumerComponent(version, consumer.scope.name, repository);
    await updateFieldsDiff(fromVersionComponent, component, diffResult, diffOpts);

    return diffResult;
  }

  async function getComponentDiffBetweenVersions(id: BitId): Promise<DiffResults> {
    const diffResult: DiffResults = { id, hasDiff: false };
    const modelComponent = await consumer.scope.getModelComponentIfExist(id);
    if (!modelComponent) {
      throw new GeneralError(`component ${id.toString()} doesn't have any version yet`);
    }
    const repository = consumer.scope.objects;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const toVersionObject: Version = await modelComponent.loadVersion(toVersion, repository);
    const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
    const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
    // $FlowFixMe version and toVersion are set when calling this function
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    diffResult.filesDiff = await getFilesDiff(fromVersionFiles, toVersionFiles, version, toVersion);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const fromVersionComponent = await modelComponent.toConsumerComponent(version, consumer.scope.name, repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const toVersionComponent = await modelComponent.toConsumerComponent(toVersion, consumer.scope.name, repository);
    await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);

    return diffResult;
  }

  async function getComponentDiff(component: Component): Promise<DiffResults> {
    const diffResult = { id: component.id, hasDiff: false };
    if (!component.componentFromModel) {
      // it's a new component. not modified. nothing to check.
      return diffResult;
    }
    const modelFiles = component.componentFromModel.files;
    const fsFiles = component.files;
    // $FlowFixMe version must be defined as the component.componentFromModel do exist
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    diffResult.filesDiff = await getFilesDiff(modelFiles, fsFiles, component.id.version, component.id.version);
    // $FlowFixMe we made sure already that component.componentFromModel is defined
    await updateFieldsDiff(component.componentFromModel, component, diffResult, diffOpts);

    return diffResult;
  }
}

export async function diffBetweenVersionsObjects(
  modelComponent: ModelComponent,
  fromVersionObject: Version,
  toVersionObject: Version,
  fromVersion: string,
  toVersion: string,
  scope: Scope,
  diffOpts: DiffOptions
) {
  const diffResult: DiffResults = { id: modelComponent.toBitId(), hasDiff: false };
  const repository = scope.objects;
  const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
  const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
  const color = diffOpts.color ?? true;
  diffResult.filesDiff = await getFilesDiff(fromVersionFiles, toVersionFiles, fromVersion, toVersion, undefined, color);
  const fromVersionComponent = await modelComponent.toConsumerComponent(
    fromVersionObject.hash().toString(),
    scope.name,
    repository
  );
  const toVersionComponent = await modelComponent.toConsumerComponent(
    toVersionObject.hash().toString(),
    scope.name,
    repository
  );
  await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);
  return diffResult;
}

async function updateFieldsDiff(
  componentA: Component,
  componentB: Component,
  diffResult: DiffResults,
  diffOpts: DiffOptions
) {
  diffResult.fieldsDiff = diffBetweenComponentsObjects(componentA, componentB, diffOpts);
  diffResult.hasDiff = hasDiff(diffResult);
}

function hasDiff(diffResult: DiffResults): boolean {
  return !!((diffResult.filesDiff && diffResult.filesDiff.find((file) => file.diffOutput)) || diffResult.fieldsDiff);
}

async function getOneFileDiff(
  filePathA: PathOsBased,
  filePathB: PathOsBased,
  fileALabel: string,
  fileBLabel: string,
  fileName: PathLinux,
  color = true
): Promise<string> {
  const fileDiff = await diffFiles(filePathA, filePathB, color);
  if (!fileDiff) return '';
  const diffStartsString = '--- '; // the part before this string is not needed for our purpose
  const diffStart = fileDiff.indexOf(diffStartsString);
  if (!diffStart || diffStart < 1) return ''; // invalid diff

  // e.g. Linux: --- a/private/var/folders/z ... .js
  // Windows: --- "a/C:\\Users\\David\\AppData\\Local\\Temp\\bit ... .js
  const regExpA = /--- ["]?a.*\n/; // exact "---", follow by a or "a (for Windows) then \n
  const regExpB = /\+\+\+ ["]?b.*\n/; // exact "+++", follow by b or "b (for Windows) then \n
  return fileDiff
    .substr(diffStart)
    .replace(regExpA, `--- ${fileName} (${fileALabel})\n`)
    .replace(regExpB, `+++ ${fileName} (${fileBLabel})\n`);
}

async function getFilesDiff(
  filesA: SourceFile[],
  filesB: SourceFile[],
  filesAVersion: string,
  filesBVersion: string,
  fileNameAttribute = 'relative',
  color = true
): Promise<FileDiff[]> {
  const filesAPaths = filesA.map((f) => f[fileNameAttribute]);
  const filesBPaths = filesB.map((f) => f[fileNameAttribute]);
  const allPaths = R.uniq(filesAPaths.concat(filesBPaths));
  const fileALabel = filesAVersion === filesBVersion ? `${filesAVersion} original` : filesAVersion;
  const fileBLabel = filesAVersion === filesBVersion ? `${filesBVersion} modified` : filesBVersion;
  const filesDiffP = allPaths.map(async (relativePath) => {
    const getFilePath = async (files): Promise<PathOsBased> => {
      const file = files.find((f) => f[fileNameAttribute] === relativePath);
      const fileContent = file ? file.contents : '';
      return saveIntoOsTmp(fileContent);
    };
    const [fileAPath, fileBPath] = await Promise.all([getFilePath(filesA), getFilePath(filesB)]);
    const diffOutput = await getOneFileDiff(fileAPath, fileBPath, fileALabel, fileBLabel, relativePath, color);
    return { filePath: relativePath, diffOutput };
  });
  return Promise.all(filesDiffP);
}

export function outputDiffResults(diffResults: DiffResults[]): string {
  return diffResults
    .map((diffResult) => {
      if (diffResult.hasDiff) {
        const titleStr = `showing diff for ${chalk.bold(diffResult.id.toStringWithoutVersion())}`;
        const titleSeparator = new Array(titleStr.length).fill('-').join('');
        const title = chalk.cyan(`${titleSeparator}\n${titleStr}\n${titleSeparator}`);
        // @ts-ignore since hasDiff is true, filesDiff must be set
        const filesWithDiff = diffResult.filesDiff.filter((file) => file.diffOutput);
        const files = filesWithDiff.map((fileDiff) => fileDiff.diffOutput).join('\n');
        const fields = diffResult.fieldsDiff ? diffResult.fieldsDiff.map((field) => field.diffOutput).join('\n') : '';
        return `${title}\n${files}\n${fields}`;
      }
      return `no diff for ${chalk.bold(diffResult.id.toString())}`;
    })
    .join('\n\n');
}
