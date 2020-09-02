import { MainRuntime } from '@teambit/cli';

import { DummyAspect } from './dummy.aspect';

export class DummyMain {
  static runtime = MainRuntime;

  static async provider() {
    // console.log('hi from dummy');
    return new DummyMain();
  }
}

DummyAspect.addRuntime(DummyMain);
