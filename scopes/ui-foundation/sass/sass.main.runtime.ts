import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { SassAspect } from './sass.aspect';
import { SassCompiler } from './sass.compiler';

export class SassMain {
  constructor(private compiler: CompilerMain) {}

  createCompiler() {
    return new SassCompiler(SassAspect.id);
  }

  static runtime = MainRuntime;
  static dependencies = [CompilerAspect];

  static async provider([compiler]: [CompilerMain]) {
    return new SassMain(compiler);
  }
}

SassAspect.addRuntime(SassMain);
