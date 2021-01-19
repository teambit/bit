import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';

export default class InvalidScopeName extends BitError {
  scopeName: string;
  id: string;

  constructor(scopeName: string, id: string) {
    super(
      `error: "${chalk.bold(
        id || scopeName
      )}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}
