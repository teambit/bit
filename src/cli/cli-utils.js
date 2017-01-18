import { toBase64, fromBase64 } from '../utils';

export const pack = objects => toBase64(objects.join('+++'));

export const unpack = str => fromBase64(str).split('+++');
