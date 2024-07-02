import fs from 'fs-extra';
import path from 'path';

import { PathOsBased } from '../path';

/**
 * Recursively search for node package inside node_modules dir
 * This function propagates up until it gets to the root provided then stops
 *
 * @param {string} packageName - package name
 * @param {string} workingDir - dir to start searching of
 * @param {string} root - path to dir to stop the search
 * @returns The resolved path for the package directory
 */
export function resolvePackagePath(packageName: string, workingDir: string, root: string): PathOsBased | undefined {
  const pathToCheck = path.resolve(workingDir, 'node_modules', packageName);

  if (fs.existsSync(pathToCheck)) {
    return pathToCheck;
  }

  if (workingDir === root) {
    return undefined;
  }

  const parentWorkingDir = path.dirname(workingDir);
  if (parentWorkingDir === workingDir) return undefined;

  return resolvePackagePath(packageName, parentWorkingDir, root);
}
