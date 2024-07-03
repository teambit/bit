import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class ObjectsWithoutConsumer extends BitError {
  constructor(public scopePath: string) {
    super(`error: unable to initialize a bit workspace. bit has found undeleted local objects at ${chalk.bold(
      scopePath
    )}.
1. use the ${chalk.bold('--reset-hard')} flag to clear all data and initialize an empty workspace.
2. if deleted by mistake, please restore .bitmap and workspace.jsonc.
3. force workspace initialization without clearing data use the ${chalk.bold('--force')} flag.`);
  }
}
