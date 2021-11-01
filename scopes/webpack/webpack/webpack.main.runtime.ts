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
import { merge } from 'webpack-merge';
import WsDevServer from 'webpack-dev-server';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

import { configFactory as devServerConfigFactory } from './config/webpack.dev.config';
import { previewConfigFactory } from './config/webpack-preview.config';
import { configFactory as baseConfigFactory } from './config/webpack.config';

import { WebpackAspect } from './webpack.aspect';
import { WebpackBundler } from './webpack.bundler';
import { WebpackDevServer } from './webpack.dev-server';

export type WebpackConfigTransformContext = GlobalWebpackConfigTransformContext & {
  target: Target;
};

export type WebpackConfigDevServerTransformContext = GlobalWebpackConfigTransformContext;

export type GlobalWebpackConfigTransformContext = {
  mode: BundlerMode;
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
    const transformerContext: GlobalWebpackConfigTransformContext = { mode: 'dev' };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    // @ts-ignore - fix this
    return new WebpackDevServer(afterMutation.raw, webpack, WsDevServer);
  }

  mergeConfig(target: any, source: any): any {
    return merge(target, source);
  }

  createBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = [],
    initialConfigs?: webpack.Configuration[]
  ) {
    const transformerContext: GlobalWebpackConfigTransformContext = { mode: 'prod' };
    const configs = initialConfigs || this.createEmptyConfigs(context.targets, transformers, transformerContext);
    return new WebpackBundler(context.targets, configs, this.logger, webpack);
  }

  createPreviewBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []) {
    const transformerContext: GlobalWebpackConfigTransformContext = { mode: 'prod' };
    const configs = this.createPreviewConfig(context.targets, transformers, transformerContext);
    return new WebpackBundler(context.targets, configs, this.logger, webpack);
  }

  private createConfigs(
    targets: Target[],
    factory: (entries: string[], outputPath: string) => Configuration,
    transformers: WebpackConfigTransformer[] = [],
    transformerContext: GlobalWebpackConfigTransformContext
  ) {
    return targets.map((target) => {
      const baseConfig = factory(target.entries, target.outputPath);
      const configMutator = new WebpackConfigMutator(baseConfig);
      const context = Object.assign({}, transformerContext, { target });
      const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, context);
      return afterMutation.raw;
    });
  }

  private createEmptyConfigs(
    targets: Target[],
    transformers: WebpackConfigTransformer[] = [],
    transformerContext: GlobalWebpackConfigTransformContext
  ) {
    return this.createConfigs(targets, baseConfigFactory, transformers, transformerContext);
  }

  private createPreviewConfig(
    targets: Target[],
    transformers: WebpackConfigTransformer[] = [],
    transformerContext: GlobalWebpackConfigTransformContext
  ) {
    return this.createConfigs(targets, previewConfigFactory, transformers, transformerContext);
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

  static async provider([pubsub, workspace, bundler, logger]: [PubsubMain, Workspace, BundlerMain, LoggerMain]) {
    const logPublisher = logger.createLogger(WebpackAspect.id);
    return new WebpackMain(pubsub, workspace, bundler, logPublisher);
  }
}

WebpackAspect.addRuntime(WebpackMain);

export function runTransformersWithContext(
  config: WebpackConfigMutator,
  transformers: Array<WebpackConfigTransformer | WebpackConfigDevServerTransformer> = [],
  context: WebpackConfigTransformContext | WebpackConfigDevServerTransformContext
): WebpackConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
