import { BitError } from '@teambit/bit-error';

export class AlreadyExistsError extends BitError {
  constructor(filePath: string) {
    super(`config file at ${filePath} already exists. use override in case you want to override it`);
  }
}
