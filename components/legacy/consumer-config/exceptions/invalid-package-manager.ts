import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidPackageManager extends BitError {
  packageManager: string;
  showDoctorMessage: boolean;

  constructor(packageManager: string) {
    super(`error: the package manager provided ${chalk.bold(packageManager)} is not a valid package manager.
please specify 'npm' or 'yarn'`);
    this.packageManager = packageManager;
    this.showDoctorMessage = false;
  }
}
