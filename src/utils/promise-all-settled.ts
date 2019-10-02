/** @flow */
import toResultObject from './promise-to-result-object';
import { ResultObject } from './promise-to-result-object';

// $FlowFixMe
export default function allSettled(promises: Promise<any>[]): Promise<ResultObject[]> {
  return Promise.all(promises.map(toResultObject()));
}
