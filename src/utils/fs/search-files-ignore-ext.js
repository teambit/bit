/** @flow */
import R from 'ramda';
import Vinyl from 'vinyl';
import { getWithoutExt } from '../';

export default function searchFilesIgnoreExt(
  files: string[] | Vinyl[],
  fileName: string,
  fileNameProp?: string,
  returnProp?: string
) {
  const _byFileNoExt = (file) => {
    const fileNameToCheck = fileNameProp ? file[fileNameProp] : file;
    return getWithoutExt(fileNameToCheck) === getWithoutExt(fileName);
  };

  if (files && !R.isEmpty(files)) {
    const foundFile = R.find(_byFileNoExt, files);
    const foundFileResult = returnProp ? foundFile[returnProp] : foundFile;
    return foundFileResult;
  }
  return null;
}
