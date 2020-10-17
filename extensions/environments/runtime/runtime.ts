import { Logger } from '@teambit/logger';
import BluebirdPromise from 'bluebird';
import { EnvNotFoundInRuntime } from '../exceptions';
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

  /**
   * execute a service on a specific env.
   */
  runEnv<T>(
    envRuntimeId: string,
    service: EnvService<T>,
    options?: { [key: string]: any }
  ): Promise<EnvsExecutionResult<T>> {
    const envRuntime = this.runtimeEnvs.find((runtime) => runtime.id === envRuntimeId);
    if (!envRuntime) throw new EnvNotFoundInRuntime(envRuntimeId);
    return this.run(service, options, [envRuntime]);
  }

  /**
   * execute a service on all environments.
   */
  async run<T>(
    /**
     * environment service to execute.
     */
    service: EnvService<T>,

    /**
     * options to proxy to the service upon execution.
     */
    options?: { [key: string]: any },
    runtimes?: EnvRuntime[]
  ): Promise<EnvsExecutionResult<T>> {
    if (!service.run) throw new Error('a service must implement `run()` in order to be executed');
    const errors: Error[] = [];
    const contexts: EnvResult<T>[] = await BluebirdPromise.mapSeries(runtimes || this.runtimeEnvs, async (env) => {
      try {
        // @ts-ignore
        const serviceResult = await service.run(new ExecutionContext(this, env), options);

        return {
          env,
          data: serviceResult,
        };
      } catch (err) {
        this.logger.error(err.message, err);
        this.logger.consoleFailure(`env ${env.id} service has failed. ${err.message}`);
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
