import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class IgnoredDirectory extends BitError {
  constructor(dir: string) {
    super(chalk.yellow(`directory "${dir}" or its files are git-ignored`));
  }
}
