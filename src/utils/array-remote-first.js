/** @flow */
export default function remoteFirst(array: any[]): any[] {
  array.shift();
  return array;
}
