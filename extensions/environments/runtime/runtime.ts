import { Logger } from '@teambit/logger';
import BluebirdPromise from 'bluebird';

import { ExecutionContext } from '../context';
import { EnvService, ServiceExecutionResult } from '../services';
import { EnvRuntime } from './env-runtime';
import { EnvsExecutionResult } from './envs-execution-result';

export interface EnvResult<T extends ServiceExecutionResult> {
  env: EnvRuntime;
  data?: T;
  error?: Error;
}

export class Runtime {
  constructor(
    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: EnvRuntime[],

    private logger: Logger
  ) {}

  async run<T>(service: EnvService<T>, options?: { [key: string]: any }): Promise<EnvsExecutionResult<T>> {
    const errors: Error[] = [];
    const contexts: EnvResult<T>[] = await BluebirdPromise.mapSeries(this.runtimeEnvs, async (env) => {
      try {
        const serviceResult = await service.run(new ExecutionContext(this, env), options);

        return {
          env,
          data: serviceResult,
        };
      } catch (err) {
        this.logger.error(err);
        errors.push(err);
        return {
          env,
          error: err,
        };
      }
    });

    return new EnvsExecutionResult(contexts);
  }
}
