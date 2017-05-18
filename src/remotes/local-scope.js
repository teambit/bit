/** @flow */
import { Scope } from '../scope';
import { BitId } from '../bit-id';
import { LOCAL_SCOPE_NOTATION } from '../constants';
import Bit from '../consumer/component';

export default class LocalScope {
  scope: Scope;
  host: string;

  constructor(scope: Scope) {
    this.scope = scope;
    this.host = LOCAL_SCOPE_NOTATION;
  }

  fetch(bitIds: BitId[]): Promise<Bit[]> {
    const promises = bitIds.map(bitId => this.scope.get(bitId));
    return Promise.all(promises);
  }

  getHost() {
    return this.host;
  }

  toPlainObject() {
    return {
      alias: LOCAL_SCOPE_NOTATION
    };
  }
}
