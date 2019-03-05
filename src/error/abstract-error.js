/** @flow */

export default class AbstractError extends Error {
  userError: boolean; // user errors are not reported to Sentry
  constructor() {
    super();
    this.name = this.constructor.name;
    this.userError = true;
  }
}
