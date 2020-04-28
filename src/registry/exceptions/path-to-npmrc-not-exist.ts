/** @flow */
export default class PathsNotExist extends Error {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.code = 'PathNotExist';
  }
}
