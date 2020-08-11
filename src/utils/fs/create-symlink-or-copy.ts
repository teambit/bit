import * as path from 'path';
import fs from 'fs-extra';
import symlinkOrCopy from 'symlink-or-copy';
import logger from '../../logger/logger';
import { PathOsBased } from '../path';
import ShowDoctorError from '../../error/show-doctor-error';

/**
 * @param srcPath the path where the symlink is pointing to
 * @param destPath the path where to write the symlink
 * @param componentId
 */
export default function createSymlinkOrCopy(
  srcPath: PathOsBased,
  destPath: PathOsBased,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  componentId?: string | null | undefined = ''
) {
  logger.silly(`create-symlink-or-copy, deleting ${destPath}`);
  fs.removeSync(destPath); // in case a symlink already generated or when linking a component, when a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.silly(`generating a symlink on ${destPath} pointing to ${srcPath}`);
    symlinkOrCopy.sync(srcPath, destPath);
  } catch (err) {
    const errorHeader = componentId ? `failed to link a component ${componentId}` : 'failed to generate a symlink';
    throw new ShowDoctorError(`${errorHeader}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }
}
