import { toBase64, fromBase64, isString } from '../utils';

export const pack = (x: Array<string> | string): string => {
  return isString(x) ? toBase64(x) : toBase64(x.join('+++'));
};

export const unpack = (str: string): Array<string> => fromBase64(str).split('+++');
