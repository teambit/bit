import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class HashNotFound extends BitError {
  hash: string;
  showDoctorMessage: boolean;

  constructor(hash: string) {
    super(`hash ${chalk.bold(hash)} not found`);
    this.hash = hash;
    this.showDoctorMessage = true;
  }
}
