import { MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import DocsAspect, { DocsMain } from '@teambit/docs';
import { MDXAspect } from './mdx.aspect';
import { MDXCompiler } from './mdx.compiler';
import { MDXDependencyDetector } from './mdx.detector';
import { MDXDocReader } from './mdx.doc-reader';
import { MdxCompilerOptions } from './compiler-options';

export class MDXMain {
  /**
   * create an instance of the MDX compiler.
   */
  createCompiler(opts: MdxCompilerOptions = MDXMain.defaultConfig) {
    const mdxCompiler = new MDXCompiler(MDXAspect.id, opts);
    return mdxCompiler;
  }

  static runtime = MainRuntime;
  static dependencies = [DocsAspect, DependencyResolverAspect];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider([docs, depResolver]: [DocsMain, DependencyResolverMain], config: MdxCompilerOptions) {
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    return new MDXMain();
  }
}

MDXAspect.addRuntime(MDXMain);
