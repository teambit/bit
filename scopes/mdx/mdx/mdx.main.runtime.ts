import { MainRuntime } from '@teambit/cli';
import DocsAspect, { DocsMain } from '@teambit/docs';
import { MDXAspect } from './mdx.aspect';
import { MDXCompiler } from './mdx.compiler';
import { MDXDocReader } from './mdx.doc-reader';

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
  static dependencies = [DocsAspect];

  static async provider([docs]: [DocsMain]) {
    docs.registerDocReader(new MDXDocReader());
    return new MDXMain();
  }
}

MDXAspect.addRuntime(MDXMain);
