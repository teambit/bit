/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { BitId } from '../bit-id';
import { LATEST_BIT_VERSION,
  BITS_DIRNAME,
  NO_PLUGIN_TYPE,
  DEFAULT_DIST_DIRNAME } from '../constants';
import BitJson from '../consumer/bit-json';
import { ComponentNotFound } from '../scope/exceptions';

function getLatestVersion(bitId: BitId, componentsDir: string): number {
  if (bitId.version !== LATEST_BIT_VERSION) return bitId.version;
  const regexRemoveLatestVersion = new RegExp(`${LATEST_BIT_VERSION}$`);
  const relativePathWithoutVersion = bitId.toPath().replace(regexRemoveLatestVersion, '');
  const pathWithoutVersion = path.join(componentsDir, relativePathWithoutVersion);
  const versionsDirs = glob.sync('*', { cwd: pathWithoutVersion });
  if (!versionsDirs || !versionsDirs.length) {
    throw new ComponentNotFound(bitId.toString());
  }
  return Math.max(versionsDirs);
}

function getRequiredFile(bitJson: BitJson): string {
  return !bitJson.compiler || bitJson.compiler !== NO_PLUGIN_TYPE ?
    path.join(DEFAULT_DIST_DIRNAME, bitJson.impl) : bitJson.impl;
}

function componentResolver(componentId: string, projectRoot: string = process.cwd()): string {
  const bitId = BitId.parse(componentId);
  const componentsDir = path.join(projectRoot, BITS_DIRNAME);
  const version = getLatestVersion(bitId, componentsDir);
  bitId.version = version.toString();
  const componentPath = path.join(componentsDir, bitId.toFullPath());
  try {
    const bitJson = BitJson.loadSync(componentPath);
    const finalFile = getRequiredFile(bitJson);
    return path.join(componentPath, finalFile);
  } catch (err) {
    if (fs.existsSync(componentPath)) throw err;
    throw new ComponentNotFound(componentId);
  }
}

export default componentResolver;
