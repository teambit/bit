import webpack from 'webpack';
import WebpackDevServer, { Configuration } from 'webpack-dev-server';
import merge from 'webpack-merge';
import { DevServer, BundlerContext, BundlerExtension } from '../bundler';
import { WorkspaceExt, Workspace } from '../workspace';
import configFactory from './config/webpack.dev.config';
import { WebpackBundler } from './webpack.bundler';

export class WebpackExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension.
     */
    private bundler: BundlerExtension
  ) {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   * @param components array of components to launch.
   * @param config webpack config. will be merged to the base webpack config as seen at './config'
   */
  createDevServer(context: BundlerContext, config: any): DevServer {
    const mergedConfig = this.getWebpackConfig(context, config);
    const compiler = webpack(mergedConfig);
    return new WebpackDevServer(compiler, mergedConfig.devServer);
  }

  getWebpackConfig(context: BundlerContext, config: Configuration) {
    return merge(this.createConfig(context.entry, this.workspace.path), config);
  }

  createBundler(context: BundlerContext, envConfig: Configuration) {
    return new WebpackBundler(context.targets, envConfig);
  }

  private createConfig(entry: string[], rootPath: string) {
    return configFactory(rootPath, entry);
  }

  static slots = [];

  static dependencies = [WorkspaceExt, BundlerExtension];

  static async provide([workspace, bundler]: [Workspace, BundlerExtension]) {
    return new WebpackExtension(workspace, bundler);
  }
}
