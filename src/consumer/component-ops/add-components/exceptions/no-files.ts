import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class NoFiles extends BitError {
  ignoredFiles: string[];

  constructor(ignoredFiles: string[]) {
    super(
      chalk.yellow('warning: no files to add') +
        chalk.yellow(ignoredFiles ? `, the following files were ignored: ${chalk.bold(ignoredFiles.join(', '))}` : '')
    );
    this.ignoredFiles = ignoredFiles;
  }
}
