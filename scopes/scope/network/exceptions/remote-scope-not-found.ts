import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class RemoteScopeNotFound extends BitError {
  name: string;
  code: number;

  constructor(name: string) {
    super(`error: remote scope "${chalk.bold(name)}" was not found.`);
    this.code = 129;
    this.name = name;
  }
}
