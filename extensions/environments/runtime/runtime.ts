import { Logger } from '@teambit/logger';
import BluebirdPromise from 'bluebird';

import { ExecutionContext } from '../context';
import { EnvService, ServiceExecutionResult } from '../services';
import { EnvRuntime } from './env-runtime';
import { EnvsExecutionResult } from './envs-execution-result';

export type EnvResult = {
  env: EnvRuntime;
  data?: ServiceExecutionResult;
  error?: Error;
};

export class Runtime {
  constructor(
    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: EnvRuntime[],

    private logger: Logger
  ) {}

  async run(service: EnvService<any>, options?: { [key: string]: any }): Promise<EnvsExecutionResult> {
    const errors: Error[] = [];
    const contexts: EnvResult[] = await BluebirdPromise.mapSeries(this.runtimeEnvs, async (env) => {
      try {
        const serviceResult = await service.run(new ExecutionContext(this, env), options);
        // return serviceResponse;
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
