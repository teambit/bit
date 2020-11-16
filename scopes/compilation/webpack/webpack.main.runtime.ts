import PubsubAspect, { PubsubMain } from '@teambit/pubsub';
import { BundlerAspect, BundlerContext, BundlerMain, DevServer, DevServerContext } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { Configuration } from 'webpack';
import merge from 'webpack-merge';

import { configFactory } from './config/webpack.dev.config';
import { WebpackAspect } from './webpack.aspect';
import { WebpackBundler } from './webpack.bundler';
import { WebpackDevServer } from './webpack.dev-server';

export class WebpackMain {
  constructor(
    /**
     * Pubsub extension.
     */
    private pubsub: PubsubMain,

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
    private logger: Logger
  ) {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   * @param components array of components to launch.
   * @param config webpack config. will be merged to the base webpack config as seen at './config'
   */
  createDevServer(context: DevServerContext, config: any): DevServer {
    const mergedConfig = this.getWebpackConfig(context, config);
    return new WebpackDevServer(mergedConfig);
  }

  getWebpackConfig(context: DevServerContext, config: Configuration): Configuration {
    return merge(
      // TODO: create the type for the webpack config
      this.createConfig(context.entry, this.workspace.path, context.id, context.rootPath, context.publicPath) as any,
      config
    );
  }

  mergeConfig(target: Configuration, source: Configuration): Configuration {
    return merge(target, source);
  }

  createBundler(context: BundlerContext, envConfig: Configuration) {
    return new WebpackBundler(context.targets, envConfig, this.logger);
  }

  private createConfig(
    entry: string[],
    rootPath: string,
    devServerID: string,
    publicRoot?: string,
    publicPath?: string
  ) {
    return configFactory(devServerID, rootPath, entry, publicRoot, publicPath, this.pubsub);
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
