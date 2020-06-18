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

  async run(service: EnvService) {
    const contexts = await Promise.all(
      this.runtimeEnvs.map(async env => {
        const res = await service.run(new ExecutionContext(env.id, this, env.env, env.components));
        return {
          env: env.id,
          res
        };
      })
    );

    return contexts;
  }
}
