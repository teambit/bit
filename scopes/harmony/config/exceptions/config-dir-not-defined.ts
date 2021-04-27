import { BitError } from '@teambit/bit-error';

export class ConfigDirNotDefined extends BitError {
  constructor() {
    super(`error: the config directory is not defined`);
  }
}
