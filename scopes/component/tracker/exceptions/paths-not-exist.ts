import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class PathsNotExist extends BitError {
  paths: string[];
  showDoctorMessage: boolean;

  constructor(paths: string[]) {
    super(`error: file or directory "${chalk.bold(paths.join(', '))}" was not found.`);
    this.paths = paths;
    this.showDoctorMessage = true;
  }
}
