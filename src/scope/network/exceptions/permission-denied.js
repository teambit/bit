/** @flow */
export default class PermissionDenied extends Error {
  scope: string;

  constructor(scope: string) {
    super();
    this.scope = scope;
  }
}
