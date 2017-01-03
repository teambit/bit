/** @flow */
import toResultObject from './promise-to-result-object';

export default function allSettled(promises: Promise[]) {
  return Promise.all(promises)
    .map(toResultObject);
}
