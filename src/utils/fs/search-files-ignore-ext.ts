import R from 'ramda';
import Vinyl from 'vinyl';

import logger from '../../logger/logger';
import { PathOsBased } from '../path';
import getWithoutExt from './fs-no-ext';

const LOWER_PRIORITY_EXTENSIONS = ['d.ts'];
const HIGHER_PRIORITY_EXTENSIONS = ['js'];

export default function searchFilesIgnoreExt(files: Vinyl[], fileName: PathOsBased): Vinyl | null;
export default function searchFilesIgnoreExt(
  files: Vinyl[],
  fileName: PathOsBased,
  returnProp: string
): PathOsBased | null;
export default function searchFilesIgnoreExt(
  files: Vinyl[],
  fileName: PathOsBased,
  returnProp?: string
): PathOsBased | Vinyl | null {
  const _byFileNoExt = (file) => getWithoutExt(file.relative) === getWithoutExt(fileName);
  const _byFileWithExt = (file) => file.relative === fileName;

  if (files && !R.isEmpty(files)) {
    const foundFile = getFile();
    return foundFile && returnProp && foundFile[returnProp]
      ? (foundFile[returnProp] as PathOsBased)
      : (foundFile as Vinyl);
  }
  return null;

  function getFile(): Vinyl | null | undefined {
    const foundFileWithExt = R.find(_byFileWithExt, files);
    if (foundFileWithExt) return foundFileWithExt;
    const foundFilesWithExt = R.filter(_byFileNoExt, files);
    if (!foundFilesWithExt.length) return null;
    if (foundFilesWithExt.length === 1) return foundFilesWithExt[0];
    logger.debug(
      `search-file-ignore-ext, found multiple files matching the criteria for ${fileName}: ${foundFilesWithExt
        .map((f) => f.relative)
        .join(', ')}`
    );
    const prioritizedFile = getMatchingFileByPriority(foundFilesWithExt);
    logger.debug(`search-file-ignore-ext, ended up using ${prioritizedFile.relative} for ${fileName}`);
    return prioritizedFile;
  }

  function getMatchingFileByPriority(foundFilesWithExt): Vinyl {
    // prefer files with extensions that are listed in HIGHER_PRIORITY_EXTENSIONS.
    const withHigherPriorities = foundFilesWithExt.filter((file) =>
      HIGHER_PRIORITY_EXTENSIONS.some((extension) => file.relative.endsWith(extension))
    );
    if (withHigherPriorities.length) return withHigherPriorities[0];
    // prefer files with extensions that are not listed in LOWER_PRIORITY_EXTENSIONS.
    const withoutLowerPriorities = foundFilesWithExt.filter(
      (file) => !LOWER_PRIORITY_EXTENSIONS.some((extension) => file.relative.endsWith(extension))
    );
    if (withoutLowerPriorities.length) return withoutLowerPriorities[0];
    return foundFilesWithExt[0];
  }
}
