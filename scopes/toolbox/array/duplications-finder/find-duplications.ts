import { uniq } from 'lodash';

export function findDuplications<T>(arr: T[]): T[] {
  const uniqArr: T[] = uniq(arr);
  if (uniqArr.length === arr.length) {
    return []; // no dup
  }
  return uniqArr.filter((u) => arr.filter((a) => a === u).length > 1);
}
