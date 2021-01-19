import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class VersionNotFound extends BitError {
  constructor(public version: string, public componentId: string) {
    super(
      `error: version "${chalk.bold(version)}"${
        componentId ? ` of component ${chalk.bold(componentId)}` : ''
      } was not found.`
    );
  }
}
