import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class PromptCanceled extends BitError {
  constructor() {
    super(chalk.yellow('operation aborted'));
  }
}
