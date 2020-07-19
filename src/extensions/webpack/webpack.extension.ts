import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import merge from 'webpack-merge';
import { DevServer, DevServerContext } from '../bundler';
import { WorkspaceExt, Workspace } from '../workspace';
import configFactory from './config/webpack.config';

export class WebpackExtension {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  createBundler() {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   * @param components array of components to launch.
   * @param config webpack config. will be merged to the base webpack config as seen at './config'
   */
  createDevServer(context: DevServerContext, config: any): DevServer {
    const mergedConfig = merge(this.createConfig(context), config);
    const compiler = webpack(mergedConfig);
    return new WebpackDevServer(compiler, mergedConfig.devServer);
  }

  private createConfig(context: DevServerContext) {
    return configFactory(this.workspace.path, context.entry);
  }

  static slots = [];

  static dependencies = [WorkspaceExt];

  static async provide([workspace]: [Workspace]) {
    return new WebpackExtension(workspace);
  }
}
