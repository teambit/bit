import chalk from 'chalk';

// @todo: should extends BitError
export default class InvalidScopeName extends Error {
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
