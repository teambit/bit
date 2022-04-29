import { BitError } from '@teambit/bit-error';

export class LaneNotFound extends BitError {
  code: number;
  constructor(public scopeName: string, public laneName: string) {
    super(`lane "${laneName}" was not found in scope "${scopeName}"`);
    this.code = 138;
  }
}
