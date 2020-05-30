import { EnvRuntime } from './env-runtime';
import { Workspace } from '../../workspace';
import { EnvService } from '../services';

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
    return this.runtimeEnvs.map(def => {
      return {
        env: def.id,
        res: def.run(this.workspace, service)
      };
    });
  }
}
