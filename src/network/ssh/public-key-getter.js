/** @flow */
import * as fs from 'fs';

const userHome = require('user-home');

function composeKeyPath() {
  return `${userHome}/.ssh/id_rsa`;
}

export default function keyGetter() {
  return fs.readFileSync(composeKeyPath());
}
