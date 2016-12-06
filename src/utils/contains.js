/** @flow */
export default function contains(str: string, searchStr: string): boolean {
  return str.indexOf(searchStr) !== -1;
}
