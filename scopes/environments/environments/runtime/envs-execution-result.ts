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
  get errors(): Error[] {
    return flatten(this.results.map((envResult) => this.getErrorsOfEnv(envResult)));
  }

  getErrorsOfEnv(envResult: EnvResult<T>): Error[] {
    const execError = envResult.error;
    const errors = envResult.data ? envResult.data.errors || [] : [];
    if (execError) errors.push(execError);
    return errors;
  }

  /**
   * if only one error is found, throw it. otherwise, summarize the errors per env and throw the
   * output
   */
  throwErrorsIfExist() {
    if (!this.errors || !this.errors.length) return;
    if (this.errors.length === 1 && this.errors[0] instanceof Error) throw this.errors[0];
    const errorsPerEnvs = this.results.map((envResult) => this.getEnvErrorsAsString(envResult));
    const errorOutput = errorsPerEnvs.join('\n\n');
    throw new Error(errorOutput);
  }

  getEnvErrorsAsString(envResult: EnvResult<T>): string {
    const errors = this.getErrorsOfEnv(envResult);
    if (!errors.length) return '';
    const title = `found ${errors.length} error(s) for ${envResult.env.id}`;
    const errorsStr = errors.map((error) => `${error.message}\n${error.stack}`).join('\n');
    return `${title}\n${errorsStr}`;
  }
}
