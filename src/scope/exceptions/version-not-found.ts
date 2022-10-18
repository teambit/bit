import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

/**
 * this is when a version is not found in the ModelComponent versions prop.
 * @see VersionNotFoundOnFS for cases when the Version object is missing from the filesystem.
 */
export default class VersionNotFound extends BitError {
  constructor(version: string, componentId: string) {
    super(`error: version "${chalk.bold(version)}" of component ${chalk.bold(componentId)} was not found.`);
  }
}
