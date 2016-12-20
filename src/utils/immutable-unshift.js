/** @flow */

export default function immutableUnshift(arr: Array<any>, newEntry: any): Array<any> {
  return [].concat(newEntry, arr);
}
