import { BitError } from '@teambit/bit-error';

export class LaneNotFound extends BitError {
  code: number;
  constructor(scopeName: string, laneName: string) {
    super(`lane ${laneName} was not found in scope ${scopeName}`);
    this.code = 138;
  }
}
