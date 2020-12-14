import chalk from 'chalk';

// @todo: should inherit from BitError
export default class InvalidVersion extends Error {
  version: string | null | undefined;

  constructor(version?: string | null) {
    super(
      `error: version ${chalk.bold(
        version || '(empty)'
      )} is not a valid semantic version. learn more: https://semver.org`
    );
  }
}
