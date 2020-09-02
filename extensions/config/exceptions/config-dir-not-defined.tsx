import { BitError } from 'bit-bin/dist/error/bit-error';

export class ConfigDirNotDefined extends BitError {
  constructor() {
    super(generateMessage());
  }

  report() {
    return this.message;
  }
}

function generateMessage() {
  return `error: the config directory is not defined`;
}
