import { render } from 'ink';

import React from 'react';

export abstract class PaperError extends Error {
  isUserError: boolean; // user errors are not reported to Sentry
  abstract render(): React.ReactElement;

  static handleError(err: PaperError): void {
    render(err.render());
  }
}
