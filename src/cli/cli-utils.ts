import { fromBase64, isString, toBase64 } from '../utils';

export const pack = (x: Array<string> | string): string => {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return isString(x) ? toBase64(x) : toBase64(x.join('+++'));
};

export const unpack = (str: string): Array<string> => fromBase64(str).split('+++');
