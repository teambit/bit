import { MainRuntime } from '@teambit/cli';
import { StatusAspect } from './status.aspect';

export class StatusMain {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    return new StatusMain();
  }
}

StatusAspect.addRuntime(StatusMain);
