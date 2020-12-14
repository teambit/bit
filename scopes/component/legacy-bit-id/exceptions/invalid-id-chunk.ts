import chalk from 'chalk';

// @todo: should extends BitError
export default class InvalidIdChunk extends Error {
  id: string;

  constructor(id: string) {
    super(
      `error: "${chalk.bold(
        id
      )}" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]`
    );
  }
}
