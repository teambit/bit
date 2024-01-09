import { BitError } from '@teambit/bit-error';

export default class WriteConfigFilesFailed extends BitError {
  constructor() {
    super('failed writing config files in the workspace. run with --log to see the error');
  }
}
