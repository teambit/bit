import { PaperError } from '../../cli';

export class ScopeNotFound extends PaperError {
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
