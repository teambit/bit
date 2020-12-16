import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class InvalidVersion extends BitError {
  version: string | null | undefined;

  constructor(version?: string | null) {
    super(
      `error: version ${chalk.bold(
        version || '(empty)'
      )} is not a valid semantic version. learn more: https://semver.org`
    );
  }
}
