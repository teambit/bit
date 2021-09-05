import fs from 'fs-extra';
import fsNative from 'fs';
import * as path from 'path';
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
  logger.trace(`createSymlinkOrCopy, deleting ${destPath}`);
  fs.removeSync(destPath); // in case a symlink already generated or when linking a component, when a component has been moved
  fs.ensureDirSync(path.dirname(destPath));
  try {
    logger.trace(
      `createSymlinkOrCopy, generating a symlink on ${destPath} pointing to ${srcPath}, avoidHardLink=${avoidHardLink}`
    );
    if (avoidHardLink) symlink();
    else link();
  } catch (err: any) {
    const winMsg = IS_WINDOWS ? ' (or maybe copy)' : '';
    const errorHeader = componentId ? `failed to link a component ${componentId}` : 'failed to generate a symlink';
    throw new ShowDoctorError(`${errorHeader}.
Symlink${winMsg} from: ${srcPath}, to: ${destPath} was failed.
Please use "--log=trace" flag to get more info about the error.
Original error: ${err}`);
  }

  function symlink() {
    IS_WINDOWS ? symlinkOrHardLink() : fs.symlinkSync(srcPath, destPath);
  }

  /**
   * for Windows. try to symlink, if fails (probably not-admin user), try to link.
   */
  function symlinkOrHardLink() {
    try {
      fs.symlinkSync(srcPath, destPath);
      logger.trace(`createSymlinkOrCopy, symlinkOrHardLink() successfully created the symlink`);
    } catch (err: any) {
      // it can be a file or directory, we don't know. just run link(), it will junction for dirs and hard-link for files.
      link();
    }
  }

  function link() {
    logger.trace(`createSymlinkOrCopy, link()`);
    try {
      hardLinkOrJunctionByFsExtra(srcPath);
      logger.trace(`createSymlinkOrCopy, link() successfully created the link`);
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        logger.trace(`createSymlinkOrCopy, link() found EXDEV error, trying fs native`);
        // this is docker, which for some weird reason, throw error: "EXDEV: cross-device link not permitted"
        // only when using fs-extra. it doesn't happen with "fs".
        hardLinkOrJunctionByFsNative(srcPath);
        return;
      }
      if (err.code !== 'ENOENT') {
        throw err;
      }
      if (path.isAbsolute(srcPath)) {
        throw err; // the file really doesn't exist :)
      }
      // the src is a relative-path of the dest, not of the cwd, that's why it got ENOENT
      if (IS_WINDOWS) {
        logger.trace(`createSymlinkOrCopy, link() changing the path to be absolute on Windows`);
        const srcAbsolute = path.join(destPath, '..', srcPath);
        hardLinkOrJunctionByFsExtra(srcAbsolute);
        return;
      }
      // on linux, you can always create symlink, regardless the relative-path.
      fs.symlinkSync(srcPath, destPath);
    }
  }

  function hardLinkOrJunctionByFsExtra(src: PathOsBased) {
    try {
      fs.linkSync(src, destPath);
    } catch (err: any) {
      if (err.code === 'EPERM') {
        logger.trace(`createSymlinkOrCopy, hardLinkOrJunctionByFsExtra() using Junction option`);
        // it's a directory. use 'junction', it works on both Linux and Win
        fs.symlinkSync(srcPath, destPath, 'junction');
      } else {
        throw err;
      }
    }
  }

  function hardLinkOrJunctionByFsNative(src: PathOsBased) {
    try {
      fsNative.linkSync(src, destPath);
    } catch (err: any) {
      if (err.code === 'EPERM' || err.code === 'EXDEV') {
        logger.trace(`createSymlinkOrCopy, hardLinkOrJunctionByFsNative() using Junction option`);
        // it's a directory. use 'junction', it works on both Linux and Win
        fsNative.symlinkSync(srcPath, destPath, 'junction');
      } else {
        throw err;
      }
    }
  }
}
