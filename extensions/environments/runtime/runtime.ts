import { Logger } from '@teambit/logger';
import BluebirdPromise from 'bluebird';

import { ExecutionContext } from '../context';
import { EnvService } from '../services';
import { EnvRuntime } from './env-runtime';

export class Runtime {
  constructor(
    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: EnvRuntime[],

    private logger: Logger
  ) {}

  async run(service: EnvService, options?: { [key: string]: any }): Promise<any[]> {
    const contexts = await BluebirdPromise.mapSeries(this.runtimeEnvs, async (env) => {
      try {
        const res = await service.run(new ExecutionContext(this, env), options);
        return {
          env: env.id,
          res,
        };
      } catch (err) {
        this.logger.error(err);
        return [];
      }
      return undefined;
    });

    return contexts;
  }
}
