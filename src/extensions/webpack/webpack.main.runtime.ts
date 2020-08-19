import { ExtensionManifest } from '@teambit/harmony';
import { Configuration } from 'webpack';
import merge from 'webpack-merge';
import { WebpackAspect } from './webpack.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { WebpackDevServer } from './webpack.dev-server';
import { DevServer, BundlerContext, BundlerMain, BundlerAspect, DevServerContext } from '../bundler';
import { WorkspaceAspect, Workspace } from '../workspace';
import configFactory from './config/webpack.dev.config';
import { WebpackBundler } from './webpack.bundler';
import { LoggerExtension, Logger } from '../logger';

export class WebpackMain {
  constructor(
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

  static runtime = MainRuntime;
  static dependencies = [WorkspaceAspect, BundlerAspect, LoggerExtension] as ExtensionManifest[];

  static async provider([workspace, bundler, logger]: [Workspace, BundlerMain, LoggerExtension]) {
    const logPublisher = logger.createLogger(WebpackMain.id);
    return new WebpackMain(workspace, bundler, logPublisher);
  }
}

WebpackAspect.addRuntime(WebpackMain);
