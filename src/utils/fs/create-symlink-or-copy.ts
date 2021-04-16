import fs from 'fs-extra';
import * as path from 'path';
import symlinkOrCopy from 'symlink-or-copy';
import { IS_WINDOWS } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { PathOsBased } from '../path';

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
  avoidHardLink = false
) {
  logger.trace(`create-symlink-or-copy, deleting ${destPath}`);
  fs.removeSync(destPath); // in case a symlink already generated or when linking a component, when a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.trace(`generating a symlink on ${destPath} pointing to ${srcPath}`);
    if (avoidHardLink) symlink();
    else link();
  } catch (err) {
    const errorHeader = componentId ? `failed to link a component ${componentId}` : 'failed to generate a symlink';
    throw new ShowDoctorError(`${errorHeader}.
         Symlink (or maybe copy for Windows) from: ${srcPath}, to: ${destPath} was failed.
         Original error: ${err}`);
  }

  function symlink() {
    IS_WINDOWS ? symlinkOrCopy.sync(srcPath, destPath) : fs.symlinkSync(srcPath, destPath);
  }

  function link() {
    try {
      hardLinkOrJunction(srcPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      if (path.isAbsolute(srcPath)) {
        throw err; // the file really doesn't exist :)
      }
      // the src is a relative-path of the dest, not of the cwd, that's why it got ENOENT
      if (IS_WINDOWS) {
        const srcAbsolute = path.join(destPath, '..', srcPath);
        hardLinkOrJunction(srcAbsolute);
        return;
      }
      // on linux, you can always create symlink, regardless the relative-path.
      fs.symlinkSync(srcPath, destPath);
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
