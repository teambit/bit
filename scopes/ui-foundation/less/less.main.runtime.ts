import { MainRuntime } from '@teambit/cli';
import { LessAspect } from './less.aspect';
import { LessCompiler } from './less.compiler';

export class LessMain {
  createCompiler() {
    return new LessCompiler(LessAspect.id);
  }

  static dependencies = [];
  static runtime = MainRuntime;

  static async provider() {
    return new LessMain();
  }
}

LessAspect.addRuntime(LessMain);
