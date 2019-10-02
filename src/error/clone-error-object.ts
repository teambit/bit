// @flow
import R from 'ramda';

export const systemFields = ['stack', 'code', 'errno', 'syscall'];

// partially forked from 'utils-copy-error' package
export default function cloneErrorObject(error: Error): Error {
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
