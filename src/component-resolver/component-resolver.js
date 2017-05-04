/** @flow */
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { BitId } from '../bit-id';
import { LATEST_BIT_VERSION,
  BITS_DIRNAME,
  NO_PLUGIN_TYPE,
  DEFAULT_DIST_DIRNAME,
  DEFAULT_BUNDLE_FILENAME } from '../constants';
import BitJson from '../consumer/bit-json';
import { ComponentNotFound } from '../scope/exceptions';

function getLatestVersion(bitId: BitId, componentsDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (bitId.version !== LATEST_BIT_VERSION) return resolve(bitId.version);
    const regexRemoveLatestVersion = new RegExp(`${LATEST_BIT_VERSION}$`);
    const relativePathWithoutVersion = bitId.toPath().replace(regexRemoveLatestVersion, '');
    const pathWithoutVersion = path.join(componentsDir, relativePathWithoutVersion);
    glob('*', { cwd: pathWithoutVersion }, (err, versionsDirs) => {
      if (err) return reject(err);
      return resolve(Math.max(versionsDirs));
    });
  });
}

function getRequiredFile(bitJson: BitJson): string {
  return !bitJson.compiler || bitJson.compiler !== NO_PLUGIN_TYPE ?
    path.join(DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME) : bitJson.impl;
}

function resolvePath(componentId: string, projectRoot: string = process.cwd()): Promise<string> {
  const bitId = BitId.parse(componentId);
  const componentsDir = path.join(projectRoot, BITS_DIRNAME);
  return getLatestVersion(bitId, componentsDir).then((version) => {
    bitId.version = version.toString();
    const componentPath = path.join(componentsDir, bitId.toPath());
    return BitJson.load(componentPath)
      .then((bitJson) => {
        const finalFile = getRequiredFile(bitJson);
        return path.join(componentPath, finalFile);
      })
      .catch((err) => {
        if (fs.existsSync(componentPath)) throw err;
        throw new ComponentNotFound(componentId);
      });
  });
}

export default resolvePath;
