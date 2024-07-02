import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class MissingBitMapComponent extends BitError {
  id: string;

  constructor(id: string) {
    super(`error: component "${chalk.bold(id)}" was not found on your local workspace.
please specify a valid component ID or track the component using 'bit create' (see 'bit create --help' for more information)`);
  }
}
