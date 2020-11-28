import { MainRuntime } from '@teambit/cli';
import { MDXAspect } from './mdx.aspect';

export class MDXMain {
  createCompiler() {}

  static runtime = MainRuntime;

  static async provider() {
    return new MDXMain();
  }
}

MDXAspect.addRuntime(MDXMain);
