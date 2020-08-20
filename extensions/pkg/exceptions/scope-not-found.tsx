import { BitError } from 'bit-bin/dist/error/bit-error';

export class ScopeNotFound extends BitError {
  constructor(readonly scopePath?: string) {
    super(generateMessage(scopePath));
  }

  report() {
    return this.message;
  }
}

function generateMessage(scopePath?: string) {
  if (scopePath) {
    return `scope not found at ${scopePath}`;
  }
  return 'scope not found';
}
