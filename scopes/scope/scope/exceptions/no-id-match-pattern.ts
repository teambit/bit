import { BitError } from '@teambit/bit-error';

export class NoIdMatchPattern extends BitError {
  constructor(pattern: string) {
    super(`unable to find any component matching the "${pattern}" pattern`);
  }
}
