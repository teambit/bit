import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class VersionNotFoundOnFS extends BitError {
  constructor(version: string, componentId: string) {
    const msg = `error: version "${chalk.bold(version)}" of component ${chalk.bold(
      componentId
    )} was not found on the filesystem.
try running "bit import". if it doesn't help, try running "bit import ${componentId} --objects"`;
    super(msg);
  }
}
