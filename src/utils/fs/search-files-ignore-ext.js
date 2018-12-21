/** @flow */
import R from 'ramda';
import Vinyl from 'vinyl';
import getWithoutExt from './fs-no-ext';
import type { PathOsBased } from '../path';

export default function searchFilesIgnoreExt(
  files: PathOsBased[] | Vinyl[],
  fileName: PathOsBased,
  fileNameProp?: string,
  returnProp?: string
): PathOsBased | Vinyl {
  const _byFileNoExt = (file) => {
    const fileNameToCheck = fileNameProp ? file[fileNameProp] : file;
    return getWithoutExt(fileNameToCheck) === getWithoutExt(fileName);
  };

  if (files && !R.isEmpty(files)) {
    const foundFile = R.find(_byFileNoExt, files);
    const foundFileResult = foundFile && returnProp && foundFile[returnProp] ? foundFile[returnProp] : foundFile;
    return foundFileResult;
  }
  return null;
}
