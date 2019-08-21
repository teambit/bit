/** @flow */
import R from 'ramda';
import Vinyl from 'vinyl';
import getWithoutExt from './fs-no-ext';
import type { PathOsBased } from '../path';

const LOWER_PRIORITY_EXTENSIONS = ['d.ts'];

export default function searchFilesIgnoreExt(
  files: Vinyl[],
  fileName: PathOsBased,
  returnProp?: string
): PathOsBased | Vinyl {
  const _byFileNoExt = file => getWithoutExt(file.relative) === getWithoutExt(fileName);
  const _byFileWithExt = file => file.relative === fileName;

  const getFile = () => {
    const foundFileWithExt = R.find(_byFileWithExt, files);
    if (foundFileWithExt) return foundFileWithExt;
    const foundFilesWithExt = R.filter(_byFileNoExt, files);
    if (!foundFilesWithExt.length) return null;
    if (foundFilesWithExt.length === 1) return foundFilesWithExt[0];
    // prefer files with extensions that are not listed in LOWER_PRIORITY_EXTENSIONS.
    const withoutLowerPriorities = foundFilesWithExt.filter(
      file => !LOWER_PRIORITY_EXTENSIONS.some(extension => file.relative.endsWith(extension))
    );
    if (withoutLowerPriorities.length) return withoutLowerPriorities[0];
    return null;
  };

  if (files && !R.isEmpty(files)) {
    const foundFile = getFile();
    return foundFile && returnProp && foundFile[returnProp] ? foundFile[returnProp] : foundFile;
  }
  return null;
}
