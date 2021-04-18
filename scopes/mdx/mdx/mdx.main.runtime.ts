import { BabelAspect, BabelMain } from '@teambit/babel';
import { MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import DocsAspect, { DocsMain } from '@teambit/docs';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import MultiCompilerAspect, { MultiCompilerMain } from '@teambit/multi-compiler';
import ReactAspect, { ReactMain } from '@teambit/react';
import { MDXAspect } from './mdx.aspect';
import { MDXCompiler } from './mdx.compiler';
import { MDXDependencyDetector } from './mdx.detector';
import { MDXDocReader } from './mdx.doc-reader';

const babelConfig = require('./babel/babel.config');

export type MDXCompilerOpts = {};

export type MDXConfig = {
  /**
   * list of file extensions to consider as MDX files.
   */
  extensions: string[];
};

export class MDXMain {
  /**
   * create an instance of the MDX compiler.
   */
  createCompiler(opts: MDXCompilerOpts = {}) {
    const mdxCompiler = new MDXCompiler(MDXAspect.id, opts);
    return mdxCompiler;
  }

  static runtime = MainRuntime;
  static dependencies = [
    DocsAspect,
    DependencyResolverAspect,
    ReactAspect,
    EnvsAspect,
    MultiCompilerAspect,
    BabelAspect,
  ];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider(
    [docs, depResolver, react, envs, multiCompiler, babel]: [
      DocsMain,
      DependencyResolverMain,
      ReactMain,
      EnvsMain,
      MultiCompilerMain,
      BabelMain
    ],
    config: MDXConfig
  ) {
    const mdx = new MDXMain();
    const mdxCompiler = multiCompiler.createCompiler([mdx.createCompiler(), babel.createCompiler(babelConfig)], {});
    const mdxEnv = envs.compose(react.reactEnv, [react.overrideCompiler(mdxCompiler)]);
    envs.registerEnv(mdxEnv);
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    return mdx;
  }
}

MDXAspect.addRuntime(MDXMain);
