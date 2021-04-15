import fs from 'fs-extra';
import * as path from 'path';
import symlinkOrCopy from 'symlink-or-copy';
import { IS_WINDOWS } from '../../constants';

import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { PathOsBased, PathOsBasedAbsolute } from '../path';

/**
 * @param srcPath the path where the symlink is pointing to
 * @param destPath the path where to write the symlink
 * @param componentId
 */
export default function createSymlinkOrCopy(
  srcPath: PathOsBased,
  destPath: PathOsBased,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  componentId?: string | null | undefined = '',
  srcAbsolute?: PathOsBasedAbsolute // for Windows if the srcPath is relative (not for the cwd), this is a must
) {
  logger.trace(`create-symlink-or-copy, deleting ${destPath}`);
  fs.removeSync(destPath); // in case a symlink already generated or when linking a component, when a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.trace(`generating a symlink on ${destPath} pointing to ${srcPath}`);
    // IS_WINDOWS ? symlinkOrCopy.sync(srcPath, destPath) : fs.symlinkSync(srcPath, destPath);
    link();
  } catch (err) {
    const errorHeader = componentId ? `failed to link a component ${componentId}` : 'failed to generate a symlink';
    throw new ShowDoctorError(`${errorHeader}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }

  function link() {
    try {
      hardLinkOrJunction(srcPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // the src might be a relative-path. we don't know whether it's a file or directory.
        if (IS_WINDOWS) {
          if (srcAbsolute) {
            hardLinkOrJunction(srcAbsolute);
            return;
          }
          throw new Error(
            `unable to link files on Windows when the src is a relative path of a directory other than cwd`
          );
        }
        // on linux, you can always create symlink, regardless the relative-path.
        fs.symlinkSync(srcPath, destPath);
      } else {
        throw err;
      }
    }
  }

  function hardLinkOrJunction(src: PathOsBased) {
    try {
      fs.linkSync(src, destPath);
    } catch (err) {
      if (err.code === 'EPERM') {
        // it's a directory. use 'junction', it works on both Linux and Win
        fs.symlinkSync(srcPath, destPath, 'junction');
      } else {
        throw err;
      }
    }
  }
}
