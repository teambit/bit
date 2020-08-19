import { DefaultEnvAspect } from './default-env.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { Environments } from '../environments';
import { PkgExtension } from '../pkg';
import { DefaultEnv } from './default-env.env';

export class DefaultEnvExtension {
  static id = '@teambit/default-env';

  constructor(
    /**
     * an instance of the default env.
     */
    private defaultEnv: DefaultEnv
  ) {}

  static runtime = MainRuntime;
  static dependencies = [Environments, PkgExtension];

  static provider([envs, pkg]: [Environments, PkgExtension]) {
    const defaultEnv = new DefaultEnv(pkg);
    const defaultEnvExtension = new DefaultEnvExtension(defaultEnv);
    envs.registerEnv(defaultEnv);
    return defaultEnvExtension;
  }
}

DefaultEnvAspect.addRuntime(DefaultEnvMain);
