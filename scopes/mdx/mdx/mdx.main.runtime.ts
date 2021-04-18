import { BabelAspect, BabelMain } from '@teambit/babel';
import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
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
    CompilerAspect,
  ];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider(
    [docs, depResolver, react, envs, multiCompiler, babel, compiler]: [
      DocsMain,
      DependencyResolverMain,
      ReactMain,
      EnvsMain,
      MultiCompilerMain,
      BabelMain,
      CompilerMain
    ],
    config: MDXConfig
  ) {
    const mdx = new MDXMain();
    const mdxCompiler = multiCompiler.createCompiler(
      [mdx.createCompiler(), babel.createCompiler(babelConfig), react.reactEnv.getCompiler()],
      {}
    );
    const mdxEnv = envs.compose(react.reactEnv, [
      react.overrideCompiler(mdxCompiler),
      react.overrideCompilerTasks([compiler.createTask('MDXCompiler', mdxCompiler)]),
    ]);
    envs.registerEnv(mdxEnv);
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    return mdx;
  }
}

MDXAspect.addRuntime(MDXMain);
