import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ScopeJsonNotFound extends BitError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string) {
    super(
      `error: scope.json file was not found at ${chalk.bold(path)}, please use ${chalk.bold(
        'bit init'
      )} to recreate the file`
    );
    this.path = path;
    this.showDoctorMessage = true;
  }
}
