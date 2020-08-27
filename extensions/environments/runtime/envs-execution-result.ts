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
}
