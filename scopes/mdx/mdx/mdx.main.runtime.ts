import type { Harmony } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { DocsMain } from '@teambit/docs';
import { DocsAspect } from '@teambit/docs';
import { ComponentID } from '@teambit/component-id';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { WorkerMain } from '@teambit/worker';
import { WorkerAspect } from '@teambit/worker';
import type { EnvsMain } from '@teambit/envs';
import { EnvContext, EnvsAspect } from '@teambit/envs';
import type { ReactEnv, ReactMain } from '@teambit/react';
import { ReactAspect } from '@teambit/react';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import { MDXAspect } from './mdx.aspect';
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
    CompilerAspect,
    GeneratorAspect,
    LoggerAspect,
    WorkerAspect,
  ];

  static defaultConfig = {
    extensions: ['.md', '.mdx'],
  };

  static async provider(
    [docs, depResolver, react, envs, compiler, generator, loggerAspect, workerMain]: [
      DocsMain,
      DependencyResolverMain,
      ReactMain,
      EnvsMain,
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

    const envContext = new EnvContext(ComponentID.fromString(MDXAspect.id), loggerAspect, workerMain, harmony);

    const mdxEnv = envs.merge<MdxEnv, ReactEnv>(new MdxEnv(react, compiler, envContext), react.reactEnv);

    envs.registerEnv(mdxEnv);
    depResolver.registerDetector(new MDXDependencyDetector(config.extensions, loggerAspect.createLogger(MDXAspect.id)));
    docs.registerDocReader(new MDXDocReader(config.extensions));
    if (generator) {
      generator.registerComponentTemplate(() => getTemplates(envContext));
    }

    mdx.mdxEnv = mdxEnv;
    return mdx;
  }
}

MDXAspect.addRuntime(MDXMain);
