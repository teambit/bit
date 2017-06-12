import path from 'path';
import fs from 'fs';
import { BIT_LOCK } from '../../constants';
import InvalidBitLock from './exceptions/invalid-bit-lock';

function bitLockPath(bitPath: string) {
  return path.join(bitPath, BIT_LOCK);
}

function load(dirPath: string) {
  const lockPath = bitLockPath(dirPath);
  if (fs.existsSync(bitLockPath)) {
    try {
      return JSON.parse(fs.readFileSync(lockPath).toString('utf8'));
    } catch (e) {
      throw new InvalidBitLock(lockPath);
    }
  }

  return {};
}

function write(dirPath: string, lockData: Object) {
  const lockPath = bitLockPath(dirPath);
  fs.writeSync(lockPath, lockData);
}
