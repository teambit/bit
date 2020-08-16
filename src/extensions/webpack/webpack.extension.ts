import { ExtensionManifest } from '@teambit/harmony';
import { Configuration } from 'webpack';
import merge from 'webpack-merge';
import { WebpackDevServer } from './webpack.dev-server';
import { DevServer, BundlerContext, BundlerExtension, DevServerContext } from '../bundler';
import { WorkspaceExt, Workspace } from '../workspace';
import configFactory from './config/webpack.dev.config';
import { WebpackBundler } from './webpack.bundler';
import { LoggerExtension, Logger } from '../logger';

export class WebpackExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension.
     */
    private bundler: BundlerExtension,

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

  getWebpackConfig(context: DevServerContext, config: Configuration) {
    return merge(this.createConfig(context.entry, this.workspace.path, context.rootPath, context.publicPath), config);
  }

  createBundler(context: BundlerContext, envConfig: Configuration) {
    return new WebpackBundler(context.targets, envConfig, this.logger);
  }

  private createConfig(entry: string[], rootPath: string, publicRoot?: string, publicPath?: string) {
    return configFactory(rootPath, entry, publicRoot, publicPath);
  }

  static id = '@teambit/webpack';

  static slots = [];

  static dependencies = [WorkspaceExt, BundlerExtension, LoggerExtension] as ExtensionManifest[];

  static async provide([workspace, bundler, logger]: [Workspace, BundlerExtension, LoggerExtension]) {
    const logPublisher = logger.createLogger(WebpackExtension.id);
    return new WebpackExtension(workspace, bundler, logPublisher);
  }
}
