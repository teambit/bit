import toResultObject from './promise-to-result-object';
import { ResultObject } from './promise-to-result-object';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default function allSettled(promises: Promise<any>[]): Promise<ResultObject[]> {
  return Promise.all(promises.map(toResultObject()));
}
