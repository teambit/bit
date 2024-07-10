import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ExcludedMainFile extends BitError {
  mainFile: string;
  constructor(mainFile: string) {
    super(`error: main file ${chalk.bold(mainFile)} was excluded from file list`);
    this.mainFile = mainFile;
  }
}
