import { MainRuntime } from '@teambit/cli';
import { Compiler } from '@teambit/compiler';
import { MultiCompilerAspect } from './multi-compiler.aspect';
import { MultiCompiler } from './multi-compiler.compiler';

export class MultiCompilerMain {
  /**
   * create a multi-compiler `Compiler` instance.
   * @param compilers list of compilers to include.
   */
  createCompiler(compilers: Compiler[]) {
    return new MultiCompiler(MultiCompilerAspect.id, compilers);
  }

  static runtime = MainRuntime;

  static async provider() {
    return new MultiCompilerMain();
  }
}

MultiCompilerAspect.addRuntime(MultiCompilerMain);
