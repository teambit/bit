export abstract class PaperError extends Error {
  isUserError: boolean; // user errors are not reported to Sentry
  abstract report(): string;

  static handleError(err: PaperError): string {
    return err.report();
  }
}
