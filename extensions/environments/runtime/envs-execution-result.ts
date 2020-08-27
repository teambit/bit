import { flatten } from 'lodash';

import { EnvResult } from './runtime';

export class EnvsExecutionResult {
  constructor(readonly results: EnvResult[]) {}

  hasErrors() {
    return Boolean(this.errors);
  }

  /**
   * execution errors.
   */
  get errors() {
    return flatten(
      this.results.map((execResult) => {
        const execError = execResult.error;
        const errors = execResult.data?.errors || [];
        if (execError) errors.push(execError);
        return errors;
      })
    );
  }
}
