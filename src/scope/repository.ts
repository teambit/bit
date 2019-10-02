/** @flow */
import Scope from './scope';
import { mkdirp } from '../utils';

export default class Repository {
  scope: Scope;
  path: string;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  getPath() {
    return this.scope.getPath();
  }

  ensureDir() {
    return mkdirp(this.getPath());
  }
}
