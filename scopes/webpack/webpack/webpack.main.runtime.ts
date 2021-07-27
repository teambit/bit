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
import webpack from 'webpack';
import WsDevServer from 'webpack-dev-server';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

import { configFactory as devServerConfigFactory } from './config/webpack.dev.config';
import { configFactory as previewConfigFactory } from './config/webpack.config';

import { WebpackAspect } from './webpack.aspect';
import { WebpackBundler } from './webpack.bundler';
import { WebpackDevServer } from './webpack.dev-server';

export type WebpackConfigTransformContext = {
  mode: BundlerMode;
};
export type WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
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
    const transformerContext: WebpackConfigTransformContext = { mode: 'dev' };
    const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
    console.log(require('util').inspect(afterMutation.raw, { depth: 5 }));
    // @ts-ignore - fix this
    return new WebpackDevServer(afterMutation.raw, webpack, WsDevServer);
  }

  mergeConfig(target: any, source: any): any {
    return merge(target, source);
  }

  createBundler(context: BundlerContext, transformers: WebpackConfigTransformer[] = []) {
    const configs = this.createPreviewConfig(context.targets);
    const transformerContext: WebpackConfigTransformContext = { mode: 'prod' };
    const mutatedConfigs = configs.map((config) => {
      const configMutator = new WebpackConfigMutator(config);
      const afterMutation = runTransformersWithContext(configMutator.clone(), transformers, transformerContext);
      return afterMutation.raw;
    });
    return new WebpackBundler(context.targets, mutatedConfigs, this.logger, webpack);
  }

  private createPreviewConfig(targets: Target[]) {
    return targets.map((target) => {
      return previewConfigFactory(target.entries, target.outputPath);
    });
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
  transformers: WebpackConfigTransformer[] = [],
  context: WebpackConfigTransformContext
): WebpackConfigMutator {
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
