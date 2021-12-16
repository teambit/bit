import { BitError } from '@teambit/bit-error';

export class LaneNotFound extends BitError {
  constructor(scopeName: string, laneName: string) {
    super(`lane ${laneName} was not found in scope ${scopeName}`);
  }
}
