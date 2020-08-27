import { flatten } from 'lodash';

import { ServiceExecutionResult } from '../services';
import { EnvResult } from './runtime';

export class EnvsExecutionResult<T extends ServiceExecutionResult> {
  constructor(readonly results: EnvResult<T>[]) {}

  hasErrors() {
    return Boolean(this.errors.length);
  }

  /**
   * execution errors.
   */
  get errors() {
    return flatten(
      this.results.map((execResult) => {
        const execError = execResult.error;
        const errors = execResult.data && execResult.data ? execResult.data.errors || [] : [];
        if (execError) errors.push(execError);
        return errors;
      })
    );
  }

  throwErrorsIfExist() {

    if (!this.errors.length) return;
    if (this.errors.length === 1 && this.errors[0] instanceof Error) throw this.errors[0];
    // todo: fix to show the error per env.
    const errorOutput = `found total ${this.errors.length} errors
${this.errors.map(err => err.message).join('\n')}`;
    throw new Error(errorOutput);
  }
}
