import { Harmony } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { DocsAspect, DocsMain } from '@teambit/docs';
import { ComponentID } from '@teambit/component-id';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkerAspect, WorkerMain } from '@teambit/worker';
import { EnvContext, EnvsAspect, EnvsMain } from '@teambit/envs';
import { MultiCompilerAspect, MultiCompilerMain } from '@teambit/multi-compiler';
import { ReactAspect, ReactEnv, ReactMain } from '@teambit/react';
import { GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { MDXAspect } from './mdx.aspect';
import { MDXCompilerOpts } from './mdx.compiler';
import { MDXDependencyDetector } from './mdx.detector';
import { MDXDocReader } from './mdx.doc-reader';
import { getTemplates } from './mdx.templates';
import { MdxEnv } from './mdx.env';

export type MDXConfig = {
  /**
   * list of file extensions to consider as MDX files.
   */
  extensions: string[];
};

export class MDXMain {
  icon() {
    return 'https://static.bit.dev/extensions-icons/mdx-icon-small.svg';
  }

  /**
   * create an instance of the MDX compiler.
   */
  createCompiler(opts: MDXCompilerOpts = {}) {
    return this.mdxEnv.createMdxCompiler(opts);
  }

  _mdxEnv: MdxEnv;
  get mdxEnv() {
    return this._mdxEnv;
  }
  private set mdxEnv(value: MdxEnv) {
    this._mdxEnv = value;
  }

  static runtime = MainRuntime;

  static dependencies = [
    DocsAspect,
    DependencyResolverAspect,
    ReactAspect,
    EnvsAspect,
    MultiCompilerAspect,
    CompilerAspect,
    GeneratorAspect,
    LoggerAspect,
    WorkerAspect,
  ];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider(
    [docs, depResolver, react, envs, multiCompiler, compiler, generator, loggerAspect, workerMain]: [
      DocsMain,
      DependencyResolverMain,
      ReactMain,
      EnvsMain,
      MultiCompilerMain,
      CompilerMain,
      GeneratorMain,
      LoggerMain,
      WorkerMain,
    ],
    config: MDXConfig,
    slots,
    harmony: Harmony
  ) {
    const mdx = new MDXMain();
    const logger = loggerAspect.createLogger(MDXAspect.id);

    const mdxEnv = envs.merge<MdxEnv, ReactEnv>(
      new MdxEnv(react, logger, multiCompiler, compiler, docs),
      react.reactEnv
    );

    envs.registerEnv(mdxEnv);
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    if (generator) {
      const envContext = new EnvContext(ComponentID.fromString(ReactAspect.id), loggerAspect, workerMain, harmony);
      generator.registerComponentTemplate(() => getTemplates(envContext));
    }

    mdx.mdxEnv = mdxEnv;
    return mdx;
  }
}

MDXAspect.addRuntime(MDXMain);
