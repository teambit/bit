/** @flow */
import * as fs from 'fs';

const userHome = require('user-home');

function composeDefaultPath() {
  return `${userHome}/.ssh/google_compute_engine`;
}

export default function keyGetter(keyPath: ?string) {
  if (keyPath) return fs.readFileSync(keyPath);
  return fs.readFileSync(composeDefaultPath());
}
