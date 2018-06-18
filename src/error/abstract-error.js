/** @flow */
import R from 'ramda';
import hash from 'object-hash';
import yn from 'yn';
import { getSync } from '../api/consumer/lib/global-config';
import { CFG_ANALYTICS_ANONYMOUS_KEY } from '../constants';

const systemFields = ['stack', 'code', 'errno', 'syscall'];

export default class AbstractError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }

  // partially forked from 'utils-copy-error' package
  clone() {
    const error = this;
    // $FlowFixMe
    const err = new error.constructor(error.message);

    systemFields.forEach((field) => {
      // $FlowFixMe
      if (error[field]) err[field] = error[field];
    });
    Object.keys(error).forEach((key) => {
      // $FlowFixMe
      err[key] = R.clone(error[key]);
    });
    return err;
  }

  makeAnonymous() {
    const clonedError = this.clone();
    const shouldHash = yn(getSync(CFG_ANALYTICS_ANONYMOUS_KEY), { default: true });
    if (!shouldHash) return clonedError;
    const fields = Object.getOwnPropertyNames(clonedError);
    const fieldToHash = fields.filter(field => !systemFields.includes(field));
    if (!fieldToHash.length) return clonedError;
    fieldToHash.forEach((field) => {
      clonedError[field] = this.hashValue(clonedError[field]);
    });
    return clonedError;
  }

  hashValue(value: any): string {
    if (!value) return value;
    const type = typeof value;
    switch (type) {
      case 'object':
        if (Array.isArray(value)) return value.map(v => hash(v));
        return hash(value);
      default:
        return hash(value);
    }
  }
}
