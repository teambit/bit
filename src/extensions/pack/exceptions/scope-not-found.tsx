// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color } from 'ink';
import { PaperError } from '../../paper';

export class ScopeNotFound extends PaperError {
  constructor(readonly scopePath?: string) {
    super(generateMessage(scopePath));
  }

  render() {
    if (this.scopePath) {
      return <Color red>{this.message}</Color>;
    }
    return <Color red>{this.message}</Color>;
    // return this.message
  }
}

function generateMessage(scopePath?: string) {
  if (scopePath) {
    return `scope not found at ${scopePath}`;
  }
  return 'scope not found';
}
