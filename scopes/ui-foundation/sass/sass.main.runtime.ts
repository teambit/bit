import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { SassAspect } from './sass.aspect';
import { SassCompiler } from './sass.compiler';

export class SassMain {
  static runtime = MainRuntime;
  static dependencies = [CompilerAspect];

  createCompiler() {
    return new SassCompiler(SassAspect.id);
  }

  static async provider([compiler]: [CompilerMain]) {
    return new SassMain();
  }
}

SassAspect.addRuntime(SassMain);
