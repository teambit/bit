import { BitError } from '@teambit/bit-error';

export class AlreadyExistsError extends BitError {
  constructor(type: string, name: string) {
    super(`${type} ${name} already exists.`);
  }
}
