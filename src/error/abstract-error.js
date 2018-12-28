/** @flow */
import R from 'ramda';

export const systemFields = ['stack', 'code', 'errno', 'syscall'];

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
}
