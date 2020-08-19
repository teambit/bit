import { DefaultEnvAspect } from './default-env.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { DefaultEnv } from './default-env.env';
import { EnvsAspect, EnvsMain } from '../environments';
import { PkgAspect, PkgMain } from '../pkg';

export class DefaultEnvMain {
  static id = '@teambit/default-env';

  constructor(
    /**
     * an instance of the default env.
     */
    private defaultEnv: DefaultEnv
  ) {}

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, PkgAspect];

  static async provider([envs, pkg]: [EnvsMain, PkgMain]) {
    const defaultEnv = new DefaultEnv(pkg);
    const defaultEnvExtension = new DefaultEnvMain(defaultEnv);
    envs.registerEnv(defaultEnv);
    return defaultEnvExtension;
  }
}

DefaultEnvAspect.addRuntime(DefaultEnvMain);
