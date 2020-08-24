import glob from 'glob';
import * as path from 'path';

import { BitId } from '../bit-id';
import { BITS_DIRNAME, LATEST_BIT_VERSION } from '../constants';
import logger from '../logger/logger';
import { ComponentNotFound } from '../scope/exceptions';
import { PathOsBased } from '../utils/path';

function getLatestVersion(bitId: BitId, componentsDir: string): number {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (bitId.hasVersion()) return bitId.version;
  const regexRemoveLatestVersion = new RegExp(`${LATEST_BIT_VERSION}$`);
  const relativePathWithoutVersion = bitId.toFullPath().replace(regexRemoveLatestVersion, '');
  const pathWithoutVersion: PathOsBased = path.join(componentsDir, relativePathWithoutVersion);
  const versionsDirs = glob.sync('*', { cwd: pathWithoutVersion });
  if (!versionsDirs || !versionsDirs.length) {
    throw new ComponentNotFound(bitId.toString());
  }
  // @ts-ignore
  return Math.max(versionsDirs);
}

function componentResolver(
  componentId: string,
  mainFilePath: string | null | undefined,
  projectRoot: PathOsBased = process.cwd()
): PathOsBased {
  const bitId = BitId.parse(componentId, true); // used for envs. components, all have a scope
  const componentsDir = path.join(projectRoot, BITS_DIRNAME);
  const version = getLatestVersion(bitId, componentsDir);
  const bitIdWithLatestVersion = bitId.changeVersion(version.toString());
  const componentPath = path.join(componentsDir, bitIdWithLatestVersion.toFullPath());
  logger.debug(`resolving component, path: ${componentPath}`);
  if (mainFilePath) {
    return path.join(componentPath, mainFilePath);
  }
  return componentPath;
}

export default componentResolver;
