import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidBitMap extends BitError {
  path: string;
  errorMessage: string;
  showDoctorMessage: boolean;

  constructor(path: string, errorMessage: string) {
    super(`error: unable to parse your bitMap file at ${chalk.bold(path)}, due to an error ${chalk.bold(errorMessage)}.
consider running ${chalk.bold('bit init --reset')} to recreate the file`);
    this.path = path;
    this.errorMessage = errorMessage;
    this.showDoctorMessage = true;
  }
}
