/** @flow */
import { loadScope, Scope } from '../../scope';

export default class Fs {
  scopePath: string;
  scope: ?Scope;

  constructor(scopePath: string) {
    this.scopePath = scopePath;
  }

  close() {
    this.scope = null;
    return this;
  }

  describeScope() {
    return this.scope.describe();
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
