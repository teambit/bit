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

type FileDiff = { filePath: string, diffOutput: string };
export type DiffResults = { id: BitId, hasDiff: boolean, filesDiff?: FileDiff[] };

export default (async function componentsDiff(consumer: Consumer, ids: BitId[]): Promise<DiffResults[]> {
  const { components } = await consumer.loadComponents(ids);
  if (!components) throw new GeneralError('failed loading the components');
  const tmp = new Tmp(consumer.scope);
  try {
    const componentsDiffResults = await Promise.all(
      components.map(component => getComponentDiff(consumer, tmp, component))
    );
    await tmp.clear();
    return componentsDiffResults;
  } catch (err) {
    await tmp.clear();
    throw err;
  }
});

async function getComponentDiff(consumer: Consumer, tmp: Tmp, component: Component): Promise<DiffResults> {
  const diffResult = { id: component.id, hasDiff: false };
  if (!component.componentFromModel) {
    // it's a new component. not modified. nothing to check.
    return diffResult;
  }
  const modelFiles = component.componentFromModel.files;
  const fsFiles = component.cloneFilesWithSharedDir();
  diffResult.filesDiff = await getFilesDiff(tmp, fsFiles, modelFiles);
  diffResult.hasDiff = !!diffResult.filesDiff.find(file => file.diffOutput);
  return diffResult;
}

async function getOneFileDiff(
  modelFilePath: PathOsBased,
  fsFilePath: PathOsBased,
  fileName: PathLinux
): Promise<string> {
  const fileDiff = await diffFiles(modelFilePath, fsFilePath);
  if (!fileDiff) return '';
  const diffStartsString = '--- '; // the part before this string is not needed for our purpose
  const diffStart = fileDiff.indexOf(diffStartsString);
  if (!diffStart || diffStart < 1) return ''; // invalid diff
  return fileDiff
    .substr(diffStart)
    .replace(new RegExp(`a${modelFilePath}`, 'g'), `${fileName} (original)`)
    .replace(new RegExp(`b${fsFilePath}`, 'g'), `${fileName} (modified)`);
}

async function getFilesDiff(tmp: Tmp, fsFiles: SourceFile[], modelFiles: SourceFile[]): Promise<FileDiff[]> {
  const fsFilePaths = fsFiles.map(f => f.relative);
  const modelFilePaths = modelFiles.map(f => f.relative);
  const allPaths = R.uniq(fsFilePaths.concat(modelFilePaths));
  const filesDiffP = allPaths.map(async (relativePath) => {
    const getFilePath = async (files) => {
      const file = files.find(f => f.relative === relativePath);
      const fileContent = file ? file.contents : '';
      return tmp.save(fileContent);
    };
    const [modelFilePath, fsFilePath] = await Promise.all([getFilePath(modelFiles), getFilePath(fsFiles)]);
    const diffOutput = await getOneFileDiff(modelFilePath, fsFilePath, relativePath);
    return { filePath: relativePath, diffOutput };
  });
  return Promise.all(filesDiffP);
}
