import fs from 'fs-extra';

import Scope from './scope';

export default class Repository {
  scope: Scope;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  path: string;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  getPath() {
    return this.scope.getPath();
  }

  ensureDir() {
    return fs.ensureDir(this.getPath());
  }
}
