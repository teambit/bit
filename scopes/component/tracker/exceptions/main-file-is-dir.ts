import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class MainFileIsDir extends BitError {
  mainFile: string;
  constructor(mainFile: string) {
    super(
      `error: the specified main path ${chalk.bold(mainFile)} is a directory, please specify a file or a pattern DSL`
    );
    this.mainFile = mainFile;
  }
}
