import toResultObject from './promise-to-result-object';
import { ResultObject } from './promise-to-result-object';

export default function allSettled(promises: Promise<any>[]): Promise<ResultObject[]> {
  return Promise.all(promises.map(toResultObject()));
}
