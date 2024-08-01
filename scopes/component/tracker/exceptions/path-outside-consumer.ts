import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class PathOutsideConsumer extends BitError {
  path: string;
  constructor(path: string) {
    super(`error: file or directory "${chalk.bold(path)}" is located outside of the workspace.`);
    this.path = path;
  }
}
