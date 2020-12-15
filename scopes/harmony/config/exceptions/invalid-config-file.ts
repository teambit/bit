import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidConfigFile extends BitError {
  showDoctorMessage: boolean;
  constructor(readonly path: string) {
    super(`error: invalid workspace.jsonc: ${chalk.bold(path)} is not a valid JSON file.
consider running ${chalk.bold('bit init --reset')} to recreate the file`);
    this.showDoctorMessage = true;
  }
}
