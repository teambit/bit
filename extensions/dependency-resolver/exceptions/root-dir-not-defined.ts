import { BitError } from 'bit-bin/dist/error/bit-error';

export class RootDirNotDefined extends BitError {
  constructor() {
    super(`root dir for installations was not defined`);
  }

  report() {
    return this.message;
  }
}
