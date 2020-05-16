import { Environment } from '../environments';

export class ReactEnv implements Environment {
  start() {
    console.log('start react here!');
  }

  build() {}

  serve() {}
}
