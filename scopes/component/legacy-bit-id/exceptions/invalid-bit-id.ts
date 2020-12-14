import chalk from 'chalk';

// @todo: should extends BitError
export default class InvalidBitId extends Error {
  id: string;

  constructor(id: string) {
    super(`error: component ID "${chalk.bold(id)}" is invalid, please use the following format: [scope]/<name>`);
  }
}
