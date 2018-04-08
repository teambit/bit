/** @flow */
import path from 'path';
import fs from 'fs-extra';
import symlinkOrCopy from 'symlink-or-copy';
import logger from '../../logger/logger';
import type { PathOsBased } from '../path';
import GeneralError from '../../error/general-error';

/**
 * @param srcPath the path where the symlink is pointing to
 * @param destPath the path where to write the symlink
 * @param componentId
 */
export default function createSymlinkOrCopy(srcPath: PathOsBased, destPath: PathOsBased, componentId: string = '') {
  fs.removeSync(destPath); // in case a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.debug(`generating a symlink on ${destPath} pointing to ${srcPath}`);
    symlinkOrCopy.sync(srcPath, destPath);
  } catch (err) {
    throw new GeneralError(`failed to link a component ${componentId}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }
}
