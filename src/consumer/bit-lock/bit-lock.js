import path from 'path';
import fs from 'fs-extra';
import { BIT_LOCK } from '../../constants';
import InvalidBitLock from './exceptions/invalid-bit-lock';

function getPath(bitPath: string) {
  return path.join(bitPath, BIT_LOCK);
}

export function load(dirPath: string) {
  const lockPath = getPath(dirPath);
  if (fs.existsSync(lockPath)) {
    try {
      return JSON.parse(fs.readFileSync(lockPath).toString('utf8'));
    } catch (e) {
      throw new InvalidBitLock(lockPath);
    }
  }

  // todo: logger.info('bit.lock: unable to find an existing bit.lock file');
  return {};
}

export function addComponent(lockObject: Object, componentId: string, componentPath: string) {
  if (lockObject[componentId]) {
    // todo: logger.info('bit.lock: overriding an exiting component "componentId"');
  }
  lockObject[componentId] = { path: componentPath };
  return lockObject;
}

// todo: use this lib: https://github.com/getify/JSON.minify to add comments to this file
// then, upon creating the file for the first time, add a comment with warnings about modifying
// the file
export function write(dirPath: string, lockObject: Object) {
  const lockPath = getPath(dirPath);
  fs.outputFileSync(lockPath, JSON.stringify(lockObject, null, 4));
}
