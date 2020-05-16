import { Environments } from '../environments';
import { ReactEnv } from './react.env';

export class React {
  static dependencies = [Environments];

  dev() {}

  build() {}

  serve() {}

  static provider([envs]: [Environments]) {
    envs.register(new ReactEnv());
  }
}
