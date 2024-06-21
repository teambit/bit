import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ScopeNotFound extends BitError {
  constructor(public scopePath: string) {
    super(`error: scope not found at ${chalk.bold(scopePath)}`);
  }
}
