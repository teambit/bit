import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class RemoteNotFound extends BitError {
  constructor(name: string) {
    super(`error: remote "${chalk.bold(name)}" was not found`);
    this.name = name;
  }
}
