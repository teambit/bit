import fs from 'fs-extra';
import path from 'path';
import { hardLinkDirectory } from '@teambit/toolbox.fs.hard-link-directory';

export function getRelativeRootComponentDir(rootComponentId: string): string {
  return getRootComponentDir('', rootComponentId);
}

export function getRootComponentDir(workspacePath: string, rootComponentId: string): string {
  return path.join(getBitRootsDir(workspacePath), rootComponentId.replace(/\//g, '_'));
}

export function getBitRootsDir(workspacePath: string): string {
  return path.join(workspacePath, 'node_modules/.bit_roots');
}

/**
 * Read all directories from the node_modules/.bit_roots directory
 */
export async function readBitRootsDir(workspacePath: string): Promise<string[]> {
  const rootsBaseDir = getBitRootsDir(workspacePath);
  try {
    const rootDirNames = await fs.readdir(rootsBaseDir);
    return rootDirNames.map((rootDir) => path.join(rootsBaseDir, rootDir, 'node_modules'));
  } catch (err: any) {
    // The envs directory will be missing if root components were not used.
    // This case is OK to ignore.
    if (err.code !== 'ENOENT') throw err;
    return [];
  }
}

/**
 * Link (using hard links) the specified packages to every root component in node_modules/.bit_roots
 */
export async function linkPkgsToBitRoots(workspacePath: string, pkgNames: string[]) {
  const rootDirs = await readBitRootsDir(workspacePath);
  await Promise.all(
    pkgNames.map((pkgName) => {
      return hardLinkDirectory(
        path.join(workspacePath, 'node_modules', pkgName),
        rootDirs.map((rootDir) => path.join(rootDir, pkgName))
      );
    })
  );
}
