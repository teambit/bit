import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class HeadNotFound extends BitError {
  constructor(id: string, headHash: string) {
    super(`head snap ${chalk.bold(headHash)} was not found for a component ${chalk.bold(id)}`);
  }
}
