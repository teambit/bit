/** @flow */

import copy from 'utils-copy-error';
import hash from 'object-hash';
import yn from 'yn';
import { getSync } from '../api/consumer/lib/global-config';
import { CFG_ANALYTICS_ANONYMOUS_KEY } from '../constants';

export default class AbstractError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }

  clone() {
    return copy(this);
  }

  makeAnonymous() {
    return this.clone();
  }

  toHash(str: string) {
    if (yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true })) {
      return hash(str);
    }
    return str;
  }
}
