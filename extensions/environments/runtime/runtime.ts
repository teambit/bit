import BluebirdPromise from 'bluebird';
import { EnvRuntime } from './env-runtime';
import { EnvService } from '../services';
import { ExecutionContext } from '../context';

export class Runtime {
  constructor(
    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: EnvRuntime[]
  ) {}

  async run(service: EnvService, options?: { [key: string]: any }): Promise<any[]> {
    const contexts = await BluebirdPromise.mapSeries(this.runtimeEnvs, async (env) => {
      const res = await service.run(new ExecutionContext(this, env), options);
      return {
        env: env.id,
        res,
      };
    });

    return contexts;
  }
}
