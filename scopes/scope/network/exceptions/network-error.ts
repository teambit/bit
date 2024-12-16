import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class NetworkError extends BitError {
  remoteErr: string;
  showDoctorMessage: boolean;

  constructor(remoteErr: string) {
    super(`error: remote failed with error the following error:\n "${chalk.bold(remoteErr)}"`);
    this.remoteErr = remoteErr;
    this.showDoctorMessage = true;
  }
}
