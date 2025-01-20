import { clone } from 'lodash';

export const systemFields = ['stack', 'code', 'errno', 'syscall'];

// partially forked from 'utils-copy-error' package
export default function cloneErrorObject(error: Error): Error {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const err = new error.constructor(error.message);

  systemFields.forEach((field) => {
    if (error[field]) err[field] = error[field];
  });
  Object.keys(error).forEach((key) => {
    err[key] = clone(error[key]);
  });
  return err;
}
