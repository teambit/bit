import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class DiagnosisNotFound extends BitError {
  constructor(public diagnosisName: string) {
    super(`error: diagnosis ${chalk.bold(diagnosisName)} not found`);
  }
}
