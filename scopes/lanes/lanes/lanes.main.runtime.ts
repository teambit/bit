import { MainRuntime } from '@teambit/cli';
import { LanesAspect } from './lanes.aspect';

export class LanesMain {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    return new LanesMain();
  }
}

LanesAspect.addRuntime(LanesMain);
