import { MainRuntime } from '@teambit/cli';
import { MDXAspect } from './mdx.aspect';
import { MDXCompiler } from './mdx.compiler';

export type MDXCompilerOpts = {};

export class MDXMain {
  /**
   * create an instance of the MDX compiler.
   */
  createCompiler(opts: MDXCompilerOpts = {}) {
    const mdxCompiler = new MDXCompiler(MDXAspect.id, opts);
    return mdxCompiler;
  }

  static runtime = MainRuntime;

  static async provider() {
    return new MDXMain();
  }
}

MDXAspect.addRuntime(MDXMain);
