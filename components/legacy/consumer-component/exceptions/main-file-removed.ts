import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class MainFileRemoved extends BitError {
  mainFile: string;
  id: string;
  constructor(mainFile: string, id: string) {
    super(`error: main file ${chalk.bold(mainFile)} was removed from ${chalk.bold(id)}.
please use "bit remove" to delete the component or "bit add" with "--main" and "--id" flags to add a new mainFile`);
    this.mainFile = mainFile;
    this.id = id;
  }
}
