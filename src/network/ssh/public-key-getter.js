/** @flow */
import * as fs from 'fs';

const userHome = require('user-home');

function composeKeyPath() {
  return `${userHome}/.ssh/google_compute_engine`;
}

export default function keyGetter() {
  return fs.readFileSync(composeKeyPath());
}
