import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidPackageJson extends BitError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string) {
    super(`error: package.json at ${chalk.bold(path)} is not a valid JSON file.
please fix the file in order to run bit commands`);
    this.path = path;
    this.showDoctorMessage = true;
  }
}
