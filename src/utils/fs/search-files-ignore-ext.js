/** @flow */
import R from 'ramda';
import Vinyl from 'vinyl';
import getWithoutExt from './fs-no-ext';
import type { PathOsBased } from '../path';

export default function searchFilesIgnoreExt(
  files: Vinyl[],
  fileName: PathOsBased,
  returnProp?: string
): PathOsBased | Vinyl {
  const _byFileNoExt = file => getWithoutExt(file.relative) === getWithoutExt(fileName);
  const _byFileWithExt = file => file.relative === fileName;

  if (files && !R.isEmpty(files)) {
    const foundFile = R.find(_byFileWithExt, files) || R.find(_byFileNoExt, files);
    return foundFile && returnProp && foundFile[returnProp] ? foundFile[returnProp] : foundFile;
  }
  return null;
}
