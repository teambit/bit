export abstract class BitError extends Error {
  constructor(msg?: string) {
    super(msg || '');
  }

  get message() {
    return this.report();
  }

  isUserError: boolean; // user errors are not reported to Sentry
  abstract report(): string;

  static handleError(err: BitError): string {
    return err.report();
  }
}
