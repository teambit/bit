import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidIndexJson extends BitError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string, message: string) {
    super(`fatal: your .bit/index.json is not a valid JSON file.
To rebuild the file, please run ${chalk.bold('bit init --reset')}.
Original Error: ${message}`);
    this.path = path;
    this.message = message;
    this.showDoctorMessage = true;
  }
}
