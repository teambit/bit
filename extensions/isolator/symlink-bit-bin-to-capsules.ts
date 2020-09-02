import { Logger } from '@teambit/logger';
import createSymlinkOrCopy from 'bit-bin/dist/utils/fs/create-symlink-or-copy';
import fs from 'fs-extra';
import path from 'path';

import { Capsule } from './capsule';

export async function symlinkBitBinToCapsules(capsules: Capsule[], logger: Logger) {
  logger.debug(`symlink bit bin to capsules, ${capsules.length} capsules`);
  const linksP = capsules.map(async (capsule) => linkBitBinInCapsule(capsule));
  return Promise.all(linksP);
}

export async function copyBitBinToCapsuleRoot(root: string, logger: Logger) {
  logger.debug(`symlink bit-bin package to capsule root`);
  const localBitBinPath = path.join(__dirname, 'bit-bin/dist/..');
  const targetPath = path.join(root, './node_modules/bit-bin');
  await fs.copy(localBitBinPath, targetPath);
}

async function linkBitBinInCapsule(capsule: Capsule) {
  const bitBinPath = path.join(capsule.wrkDir, './node_modules/bit-bin');
  const getLocalBitBinPath = () => {
    const pathOutsideNodeModules = path.join(__dirname, 'bit-bin/dist/..');
    const dirInIsolator = path.normalize('node_modules/@teambit/isolator/dist/bit-bin');
    if (pathOutsideNodeModules.includes(dirInIsolator)) {
      return pathOutsideNodeModules.replace(dirInIsolator, '');
    }
    return pathOutsideNodeModules;
    // if (pathOutsideNodeModules.endsWith(`${path.sep}dist`)) {
    //   return pathOutsideNodeModules;
    // }
    // if (__dirname.includes('build-harmony')) {
    //   // for bit-bin development, the cli extension is installed as a package in build-harmony directory
    //   return path.join(__dirname.split('build-harmony')[0], 'dist');
    // }
    // throw new Error('unable to link bit-bin to the capsule, the location of bit-bin is unknown');
  };
  const localBitBinPath = getLocalBitBinPath();
  // if there are no deps, sometimes the node_modules folder is not created
  // and we need it in order to perform the linking
  try {
    capsule.fs.mkdirSync('node_modules');
  } catch (e) {
    // fail silently - we only need to create it if it doesn't already exist
  }

  // we use fs directly here rather than the capsule.fs because there are some edge cases
  // that the capsule fs does not deal with well (eg. identifying and deleting
  // a symlink rather than the what the symlink links to)
  await fs.remove(bitBinPath);
  createSymlinkOrCopy(localBitBinPath, bitBinPath);
}
