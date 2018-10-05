/** @flow */
import fs from 'fs-extra';
import { identityFile } from '../../../utils';

function readKey(keyPath: ?string) {
  if (!keyPath) return '';

  try {
    return fs.readFileSync(keyPath);
  } catch (e) {
    return '';
  }
}

export default function keyGetter(keyPath: ?string) {
  if (keyPath) return readKey(keyPath);
  return readKey(identityFile());
}
