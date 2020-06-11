import { EnvRuntime } from './env-runtime';
import { Workspace } from '../../workspace';
import { EnvService } from '../services';
import { ExecutionContext } from '../context';

export class Runtime {
  constructor(
    /**
     * instance of the containing workspace.
     */
    readonly workspace: Workspace,

    /**
     * runtime instances of the environments.
     */
    readonly runtimeEnvs: EnvRuntime[]
  ) {}

  async run(service: EnvService) {
    const contexts = await Promise.all(
      this.runtimeEnvs.map(async env => {
        const res = await service.run(new ExecutionContext(env.id, this, env.env, env.components, this.workspace));
        return {
          env: env.id,
          res
        };
      })
    );

    return contexts;
  }
}
