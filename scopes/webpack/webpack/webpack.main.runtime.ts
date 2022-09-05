import webpack, { Configuration } from 'webpack';
import PubsubAspect, { PubsubMain } from '@teambit/pubsub';
import {
  BundlerAspect,
  BundlerContext,
  BundlerMain,
  DevServer,
  DevServerContext,
  BundlerMode,
  Target,
} from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { GeneratorMain } from '@teambit/generator';
import { merge } from 'webpack-merge';
import WsDevServer from 'webpack-dev-server';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

import { webpackTransformerTemplate } from './templates';

import { generateAddAliasesFromPeersTransformer, generateExternalsTransformer } from './transformers';
import { configFactory as devServerConfigFactory } from './config/webpack.dev.config';
import { configFactory as baseConfigFactory } from './config/webpack.config';

import { WebpackAspect } from './webpack.aspect';
import { WebpackBundler } from './webpack.bundler';
import { WebpackDevServer } from './webpack.dev-server';

export type WebpackConfigTransformContext = GlobalWebpackConfigTransformContext & {
  target: Target;
};

export type WebpackConfigDevServerTransformContext = GlobalWebpackConfigTransformContext & DevServerContext;

export type GlobalWebpackConfigTransformContext = {
  mode: BundlerMode;
  /**
   * A path for the host root dir
   * Host root dir is usually the env root dir
   * This can be used in different bundle options which run require.resolve
   * for example when configuring webpack aliases or webpack expose loader on the peers deps
   */
  hostRootDir?: string;
};

export type WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => WebpackConfigMutator;

export type WebpackConfigDevServerTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigDevServerTransformContext
) => WebpackConfigMutator;

export class WebpackMain {
  constructor(
    /**
     * Pubsub extension.
     */
    public pubsub: PubsubMain,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension.
     */
    private bundler: BundlerMain,

    /**
     * Logger extension
     */
    public logger: Logger
  ) {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   */
  createDevServer(context: DevServerContext, transformers: WebpackConfigTransformer[] = []): DevServer {
    const config = this.createDevServerConfig(
      context.entry,
      this.workspace.path,
      context.id,
      context.rootPath,
      context.publicPath,
      context.title
    ) as any;
    const configMutator = new WebpackConfigMutator(config);
    const transformerContext: WebpackConfigDevServerTransformContext = Object.assign(context, { mode: 'dev' as const });
    const internalTransformers = this.generateTransformers(undefined, transformerContext);

    const afterMutation = runTransformersWithContext(
      configMutator.clone(),
      [...internalTransformers, ...transformers],
      transformerContext
    );
    // @ts-ignore - fix this
    return new WebpackDevServer(afterMutation.raw, webpack, WsDevServer);
  }

  mergeConfig(target: any, source: any): any {
    return merge(target, source);
  }

  createBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = [],
    initialConfigs?: webpack.Configuration[],
    webpackInstance?: any
  ) {
    const transformerContext: GlobalWebpackConfigTransformContext = { mode: 'prod' };
    // eslint-disable-next-line max-len
    const configs =
      initialConfigs ||
      this.createConfigs(context.targets, baseConfigFactory, transformers, transformerContext, context);
    return new WebpackBundler(context.targets, configs, this.logger, webpackInstance || webpack, context.metaData);
  }

  private createConfigs(
    targets: Target[],
    factory: (target: Target, context: BundlerContext) => Configuration,
    transformers: WebpackConfigTransformer[] = [],
    transformerContext: GlobalWebpackConfigTransformContext,
    bundlerContext: BundlerContext
  ) {
    return targets.map((target) => {
      const baseConfig = factory(target, bundlerContext);
      const configMutator = new WebpackConfigMutator(baseConfig);
      const context = Object.assign({}, transformerContext, { target });
      const internalTransformers = this.generateTransformers(context, undefined, target);
      const afterMutation = runTransformersWithContext(
        configMutator.clone(),
        [...internalTransformers, ...transformers],
        context
      );
      return afterMutation.raw;
    });
  }

  private generateTransformers(
    _bundlerContext?: WebpackConfigTransformContext,
    devServerContext?: WebpackConfigDevServerTransformContext,
    target?: Target
  ): Array<WebpackConfigTransformer> {
    const transformers: WebpackConfigTransformer[] = [];
    // TODO: handle dev server
    const hostDeps = target?.hostDependencies || devServerContext?.hostDependencies;
    if (hostDeps) {
      if (target?.aliasHostDependencies || devServerContext?.aliasHostDependencies) {
        const peerAliasesTransformer = generateAddAliasesFromPeersTransformer(hostDeps, this.logger);
        transformers.push(peerAliasesTransformer);
      }
      if (target?.externalizeHostDependencies || devServerContext?.externalizeHostDependencies) {
        const externalsTransformer = generateExternalsTransformer(hostDeps);
        transformers.push(externalsTransformer);
      }
    }
    return transformers;
  }

  private createDevServerConfig(
    entry: string[],
    rootPath: string,
    devServerID: string,
    publicRoot: string,
    publicPath: string,
    title?: string
  ) {
    return devServerConfigFactory(devServerID, rootPath, entry, publicRoot, publicPath, this.pubsub, title);
  }

  static slots = [];

  static runtime = MainRuntime;
  static dependencies = [PubsubAspect, WorkspaceAspect, BundlerAspect, LoggerAspect];

  static async provider([pubsub, workspace, bundler, logger, generator]: [
    PubsubMain,
    Workspace,
    BundlerMain,
    LoggerMain,
    GeneratorMain
  ]) {
    const logPublisher = logger.createLogger(WebpackAspect.id);
    generator.registerComponentTemplate([webpackTransformerTemplate]);
    return new WebpackMain(pubsub, workspace, bundler, logPublisher);
  }
}

WebpackAspect.addRuntime(WebpackMain);

export function runTransformersWithContext(
  config: WebpackConfigMutator,
  transformers: Array<WebpackConfigTransformer | WebpackConfigDevServerTransformer> = [],
  // context: WebpackConfigTransformContext | WebpackConfigDevServerTransformContext
  context: any
): WebpackConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    // @ts-ignore
    return transformer(acc, context);
  }, config);
  return newConfig;
}
