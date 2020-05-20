import { Environments } from '../environments';
import { ExtEnv } from './ext-env';

export class ExtensionEnv {
  static dependencies = [Environments];

  static provider([envs]: [Environments]) {
    envs.register(new ExtEnv());
  }
}
