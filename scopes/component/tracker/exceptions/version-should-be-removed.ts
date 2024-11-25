import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class VersionShouldBeRemoved extends BitError {
  id: string;
  constructor(id: string) {
    super(`please remove the version part from the specified id ${chalk.bold(id)} and try again`);
    this.id = id;
  }
}
