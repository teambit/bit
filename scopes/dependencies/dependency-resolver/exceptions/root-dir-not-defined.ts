import { BitError } from '@teambit/bit-error';

export class RootDirNotDefined extends BitError {
  constructor() {
    super(`root dir for installations was not defined`);
  }
}
