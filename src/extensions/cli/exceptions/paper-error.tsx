export abstract class PaperError extends Error {
  constructor(msg?: string) {
    super(msg || '');
  }

  get message() {
    return this.report();
  }

  isUserError: boolean; // user errors are not reported to Sentry
  abstract report(): string;

  static handleError(err: PaperError): string {
    return err.report();
  }
}
