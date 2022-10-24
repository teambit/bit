import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class ParentNotFound extends BitError {
  constructor(private id: string, private versionHash: string, private parentHash: string) {
    super(`component ${chalk.bold(id)} missing data. parent ${parentHash} of version ${versionHash} was not found.`);
  }
}
