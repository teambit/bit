/** @flow */
import { Scope } from '../scope';
import { BitId } from '../bit-id';
import { LOCAL_SCOPE_NOTATION } from '../constants';
import Bit from '../bit';

export default class LocalScope {
  scope: Scope;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  fetch(bitIds: BitId[]): Promise<Bit[]> {
    const promises = bitIds.map(bitId => this.scope.get(bitId));
    return Promise.all(promises);
  }

  toPlainObject() {
    return {
      alias: LOCAL_SCOPE_NOTATION
    };
  }
}
