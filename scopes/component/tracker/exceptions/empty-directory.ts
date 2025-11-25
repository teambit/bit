import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class EmptyDirectory extends BitError {
  constructor(dir: string) {
    super(chalk.yellow(`directory "${dir}" is empty, no files to add`));
  }
}
