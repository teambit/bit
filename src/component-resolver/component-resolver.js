/** @flow */
import path from 'path';
import glob from 'glob';
import { BitId } from '../bit-id';
import { LATEST_BIT_VERSION, BITS_DIRNAME } from '../constants';
import { ComponentNotFound } from '../scope/exceptions';
import logger from '../logger/logger';

function getLatestVersion(bitId: BitId, componentsDir: string): number {
  if (bitId.version !== LATEST_BIT_VERSION) return bitId.version;
  const regexRemoveLatestVersion = new RegExp(`${LATEST_BIT_VERSION}$`);
  const relativePathWithoutVersion = bitId.toFullPath().replace(regexRemoveLatestVersion, '');
  const pathWithoutVersion = path.join(componentsDir, relativePathWithoutVersion);
  const versionsDirs = glob.sync('*', { cwd: pathWithoutVersion });
  if (!versionsDirs || !versionsDirs.length) {
    throw new ComponentNotFound(bitId.toString());
  }
  return Math.max(versionsDirs);
}

function componentResolver(componentId: string, mainFilePath: string, projectRoot: string = process.cwd()): string {
  const bitId = BitId.parse(componentId);
  const componentsDir = path.join(projectRoot, BITS_DIRNAME);
  const version = getLatestVersion(bitId, componentsDir);
  bitId.version = version.toString();
  const componentPath = path.join(componentsDir, bitId.toFullPath());
  logger.debug(`resolving component, path: ${componentPath}`);
  return path.join(componentPath, mainFilePath);
}

export default componentResolver;
