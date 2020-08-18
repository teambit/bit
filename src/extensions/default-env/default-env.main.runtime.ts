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

  static dependencies = [Environments, PkgExtension];

  static provider([envs, pkg]: [Environments, PkgExtension]) {
    const defaultEnv = new DefaultEnv(pkg);
    const defaultEnvExtension = new DefaultEnvExtension(defaultEnv);
    envs.registerEnv(defaultEnv);
    return defaultEnvExtension;
  }
}
