/** @flow */
import R from 'ramda';
import logger from '../../../logger/logger';
import { Version } from '../../models';

/**
 * If there are duplicate files, meaning, the same name but different letter case, remove the duplications
 */
function removeDuplicateFiles(versionModel: Version): Object {
  const _getFiles = (files) => {
    const filesPaths = files.map(file => file.relativePath);
    const duplicateFiles = files.reduce((acc, file) => {
      const lowerCaseFile = file.relativePath.toLowerCase();
      const isDuplicate = filesPaths.filter(f => lowerCaseFile === f.toLowerCase()).length > 1;
      if (isDuplicate) {
        if (acc[lowerCaseFile]) acc[lowerCaseFile].push(file);
        else acc[lowerCaseFile] = [file];
      }
      return acc;
    }, {});
    if (R.isEmpty(duplicateFiles)) return files;
    logger.warn('found duplicate files, making a decision which one to keep');
    // first, make sure they're all have the same hash. otherwise, they're not different files.
    // if the duplicates files have different letter case, and one is the same as mainFile, use it.
    // if one of the duplication has test=true, use it.
    // otherwise, just pick the first one.
    const duplicateFilesNames = Object.keys(duplicateFiles);
    const nonDuplicateFiles = files.filter(f => !duplicateFilesNames.includes(f.relativePath.toLowerCase()));
    Object.keys(duplicateFiles).forEach((dupFileName) => {
      const dupFile = duplicateFiles[dupFileName];
      const firstItem = dupFile[0];
      const fileHash = firstItem.file;
      if (!dupFile.every(f => f.file === fileHash)) {
        throw new Error('failed loading the files, some file names are identical but with different content');
      }
      const allSameLetterCase = dupFile.every(f => firstItem.relativePath === f.relativePath);
      const testFile = dupFile.find(f => f.test);
      if (!allSameLetterCase) {
        const sameAsMainFile = dupFile.find(f => f.relativePath === versionModel.mainFile);
        if (sameAsMainFile) {
          nonDuplicateFiles.push(sameAsMainFile);
          return;
        }
      }
      if (testFile) nonDuplicateFiles.push(testFile);
      else nonDuplicateFiles.push(firstItem);
    });
    return nonDuplicateFiles;
  };
  try {
    const filesWithNoDuplications = _getFiles(versionModel.files);
    versionModel.files = filesWithNoDuplications;
  } catch (err) {
    logger.error(
      `failed removing duplicated files, err: ${err.message}. Leaving the version object as is with no changes`
    );
  }
  return versionModel;
}

export default {
  name: 'remove duplicate files',
  migrate: removeDuplicateFiles
};
