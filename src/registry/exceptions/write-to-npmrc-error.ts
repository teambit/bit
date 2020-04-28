/** @flow */
export default class WriteToNpmrcError extends Error {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.code = 'WriteError';
  }
}
