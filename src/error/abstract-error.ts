export default class AbstractError extends Error {
  isUserError: boolean; // user errors are not reported to Sentry
  constructor() {
    super();
    this.name = this.constructor.name;
    this.isUserError = true;
  }
}
