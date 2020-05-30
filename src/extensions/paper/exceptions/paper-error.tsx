import { render } from 'ink';

import React from 'react';

export abstract class PaperError extends Error {
  abstract render(): React.ReactElement;

  static handleError(err: PaperError) {
    const { unmount } = render(err.render());
    unmount();
  }
}
