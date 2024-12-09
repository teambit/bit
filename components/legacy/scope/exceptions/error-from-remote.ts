import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class ErrorFromRemote extends BitError {
  constructor(remoteName: string, errMessage: string) {
    super(`remote ${chalk.bold(remoteName)} responded with the following error:
${errMessage}`);
  }
}
