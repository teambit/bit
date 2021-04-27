import { BitError } from '@teambit/bit-error';

export class ScopeNotFound extends BitError {
  constructor(readonly scopePath?: string) {
    super(generateMessage(scopePath));
  }
}

function generateMessage(scopePath?: string) {
  if (scopePath) {
    return `scope not found at ${scopePath}`;
  }
  return 'scope not found';
}
