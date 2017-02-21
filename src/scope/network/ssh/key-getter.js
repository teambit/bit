/** @flow */
import * as fs from 'fs';
import { getSync } from '../../../api/consumer/lib/global-config';
import { CFG_SSH_KEY_FILE_KEY, DEFAULT_SSH_KEY_FILE } from '../../../constants';

function getPathToIdentityFile() {
  const identityFile = getSync(CFG_SSH_KEY_FILE_KEY);
  return identityFile || DEFAULT_SSH_KEY_FILE;
}

export default function keyGetter(keyPath: ?string) {
  if (keyPath) return fs.readFileSync(keyPath);
  return fs.readFileSync(getPathToIdentityFile());
}
