import { BitError } from 'bit-bin/dist/error/bit-error';

export class AlreadyExistsError extends BitError {
  constructor(filePath: string) {
    super(`config file at ${filePath} already exist. use override in case you want to override it`);
  }
  report() {
    // return this.message;
  }
}
