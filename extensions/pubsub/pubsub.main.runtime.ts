import { MainRuntime } from '@teambit/cli';

import { PubsubAspect } from './pubsub.aspect';

export class PubsubMain {
  static runtime = MainRuntime;

  static async provider() {
    console.log('hi pubsub');
    return new PubsubMain();
  }
}

PubsubAspect.addRuntime(PubsubMain);
