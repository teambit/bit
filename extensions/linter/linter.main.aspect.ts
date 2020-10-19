import { MainRuntime } from '@teambit/cli';
import { LinterAspect } from './linter.aspect';

export class Linter {
  static runtime = MainRuntime;

  static async provider() {
    return new Linter();
  }
}

LinterAspect.addRuntime(Linter);
