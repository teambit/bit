// @flow
import R from 'ramda';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import GeneralError from '../../error/general-error';
import Component from '../component/consumer-component';
import { SourceFile } from '../component/sources';
import { Tmp } from '../../scope/repositories';
import diffFiles from '../../utils/diff-files';
import type { PathLinux, PathOsBased } from '../../utils/path';
import { Version } from '../../scope/models';

type FileDiff = { filePath: string, diffOutput: string };
export type DiffResults = { id: BitId, hasDiff: boolean, filesDiff?: FileDiff[] };

export default (async function componentsDiff(
  consumer: Consumer,
  ids: BitId[],
  version?: string,
  toVersion?: string
): Promise<DiffResults[]> {
  const { components } = await consumer.loadComponents(ids);
  if (!components) throw new GeneralError('failed loading the components');
  const tmp = new Tmp(consumer.scope);

  try {
    const getResults = (): Promise<DiffResults[]> => {
      if (version && toVersion) {
        return Promise.all(ids.map(id => getComponentDiffBetweenVersions(consumer, tmp, id, version, toVersion)));
      }
      if (version) {
        return Promise.all(components.map(component => getComponentDiffOfVersion(consumer, tmp, component, version)));
      }
      return Promise.all(components.map(component => getComponentDiff(consumer, tmp, component)));
    };
    const componentsDiffResults = await getResults();
    await tmp.clear();
    return componentsDiffResults;
  } catch (err) {
    await tmp.clear();
    throw err;
  }
});

async function getComponentDiffOfVersion(
  consumer: Consumer,
  tmp: Tmp,
  component: Component,
  version: string
): Promise<DiffResults> {
  const diffResult = { id: component.id, hasDiff: false };
  const modelComponent = await consumer.scope.getModelComponentIfExist(component.id);
  if (!modelComponent) {
    throw new GeneralError(`component ${component.id.toString()} doesn't have any version yet`);
  }
  const repository = consumer.scope.objects;
  const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
  const versionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
  const fsFiles = component.cloneFilesWithSharedDir();
  diffResult.filesDiff = await getFilesDiff(tmp, versionFiles, fsFiles, version, component.id.version);
  diffResult.hasDiff = !!diffResult.filesDiff.find(file => file.diffOutput);
  return diffResult;
}

async function getComponentDiffBetweenVersions(
  consumer: Consumer,
  tmp: Tmp,
  id: BitId,
  version: string,
  toVersion: string
): Promise<DiffResults> {
  const diffResult = { id, hasDiff: false };
  const modelComponent = await consumer.scope.getModelComponentIfExist(id);
  if (!modelComponent) {
    throw new GeneralError(`component ${id.toString()} doesn't have any version yet`);
  }
  const repository = consumer.scope.objects;
  const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
  const toVersionObject: Version = await modelComponent.loadVersion(toVersion, repository);
  const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
  const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
  diffResult.filesDiff = await getFilesDiff(tmp, fromVersionFiles, toVersionFiles, version, toVersion);
  diffResult.hasDiff = !!diffResult.filesDiff.find(file => file.diffOutput);
  return diffResult;
}

async function getComponentDiff(consumer: Consumer, tmp: Tmp, component: Component): Promise<DiffResults> {
  const diffResult = { id: component.id, hasDiff: false };
  if (!component.componentFromModel) {
    // it's a new component. not modified. nothing to check.
    return diffResult;
  }
  const modelFiles = component.componentFromModel.files;
  const fsFiles = component.cloneFilesWithSharedDir();
  diffResult.filesDiff = await getFilesDiff(tmp, modelFiles, fsFiles, component.id.version, component.id.version);
  diffResult.hasDiff = !!diffResult.filesDiff.find(file => file.diffOutput);
  return diffResult;
}

async function getOneFileDiff(
  filePathA: PathOsBased,
  filePathB: PathOsBased,
  fileALabel: string,
  fileBLabel: string,
  fileName: PathLinux
): Promise<string> {
  const fileDiff = await diffFiles(filePathA, filePathB);
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
  tmp: Tmp,
  filesA: SourceFile[],
  filesB: SourceFile[],
  filesAVersion: string,
  filesBVersion: string
): Promise<FileDiff[]> {
  const filesAPaths = filesA.map(f => f.relative);
  const filesBPaths = filesB.map(f => f.relative);
  const allPaths = R.uniq(filesAPaths.concat(filesBPaths));
  const fileALabel = filesAVersion === filesBVersion ? `${filesAVersion} original` : filesAVersion;
  const fileBLabel = filesAVersion === filesBVersion ? `${filesBVersion} modified` : filesBVersion;
  const filesDiffP = allPaths.map(async (relativePath) => {
    const getFilePath = async (files): Promise<PathOsBased> => {
      const file = files.find(f => f.relative === relativePath);
      const fileContent = file ? file.contents : '';
      return tmp.save(fileContent);
    };
    const [fileAPath, fileBPath] = await Promise.all([getFilePath(filesA), getFilePath(filesB)]);
    const diffOutput = await getOneFileDiff(fileAPath, fileBPath, fileALabel, fileBLabel, relativePath);
    return { filePath: relativePath, diffOutput };
  });
  return Promise.all(filesDiffP);
}
