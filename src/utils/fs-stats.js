/** @flow */
import { stat } from 'fs';
import promisify from './promisify';

export default function stats(path: string): Promise<boolean> {
  return promisify(stat)(path);
}
