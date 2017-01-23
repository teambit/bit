/** @flow */
import * as fs from 'fs';
import { getSync } from '../../../api/consumer/lib/global-config';

const userHome = require('user-home');

function getPathToIdentityFile() {
  const identityFile = getSync('ssh_key_file');
  return identityFile || `${userHome}/.ssh/id_rsa`;
}

export default function keyGetter(keyPath: ?string) {
  if (keyPath) return fs.readFileSync(keyPath);
  return fs.readFileSync(getPathToIdentityFile());
}
