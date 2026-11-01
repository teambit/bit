import { cloneDeep } from 'lodash';

export const systemFields = ['stack', 'code', 'errno', 'syscall'];

// partially forked from 'utils-copy-error' package
export default function cloneErrorObject(error: Error): Error {
  const err = new (error.constructor as new (message: string) => Error)(error.message);

  systemFields.forEach((field) => {
    if (error[field]) err[field] = error[field];
  });
  Object.keys(error).forEach((key) => {
    err[key] = cloneDeep(error[key]);
  });
  return err;
}
