import { BitError } from '@teambit/bit-error';

export class IdNotFoundInGraph extends BitError {
  constructor(bitIdStr: string) {
    super(`failed finding ${bitIdStr} in the graph`);
  }
}
