import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ComponentNotFoundInPath extends BitError {
  path: string;
  code: number;

  constructor(path: string) {
    super(`error: component in path "${chalk.bold(path)}" was not found`);
    this.code = 127;
    this.path = path;
  }
}
