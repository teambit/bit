import { Logger } from '@teambit/logger';
import { ComponentID } from '@teambit/component';
import mapSeries from 'p-map-series';
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
  runEnv<T extends ServiceExecutionResult>(
    envRuntimeId: string,
    service: EnvService<T>,
    options?: { [key: string]: any }
  ): Promise<EnvsExecutionResult<T>> {
    const envRuntime = this.runtimeEnvs.find((runtime) => {
      const id = ComponentID.fromString(runtime.id);
      const withoutVersion = id._legacy.toStringWithoutVersion();
      return withoutVersion === envRuntimeId;
    });
    if (!envRuntime) throw new EnvNotFoundInRuntime(envRuntimeId);
    return this.run(service, options, [envRuntime]);
  }

  /**
   * execute a service once for all environments.
   */
  async runOnce<T extends ServiceExecutionResult>(
    service: EnvService<T>,
    options?: { [key: string]: any }
  ): Promise<any> {
    if (!service.runOnce) throw new Error('a service must implement `runOnce()` in order to be executed');
    const envsExecutionContext = this.getEnvExecutionContext();
    const serviceResult = await service.runOnce(envsExecutionContext, options);
    return serviceResult;
  }

  getEnvExecutionContext(): ExecutionContext[] {
    const envsExecutionContext = this.runtimeEnvs.map((env) => new ExecutionContext(this, env));
    return envsExecutionContext;
  }

  /**
   * execute a service on each one of the environments.
   */
  async run<T extends ServiceExecutionResult>(
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
    const contexts: EnvResult<T>[] = await mapSeries(runtimes || this.runtimeEnvs, async (env) => {
      try {
        // @ts-ignore
        const serviceResult = await service.run(new ExecutionContext(this, env), options);

        return {
          env,
          data: serviceResult,
        };
      } catch (err: any) {
        this.logger.error(err.message, err);
        this.logger.consoleFailure(`service "${service.name}" of env "${env.id}" has failed. error: ${err.message}`);
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
