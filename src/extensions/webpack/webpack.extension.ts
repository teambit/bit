import { join } from 'path';
import webpack, { MultiCompiler } from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import merge from 'webpack-merge';
import { DevServer, BundlerContext, BundlerExtension } from '../bundler';
import { WorkspaceExt, Workspace } from '../workspace';
import configFactory from './config/webpack.config';
import previewConfigFactory from './config/webpack.preview.config';
import { Bundler } from '../bundler/bundler';
import { WebpackBundler } from './webpack.bundler';
import { BuildContext } from '../builder';

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

  async createBundler(context: BuildContext, config: any): Promise<Bundler> {
    const compiler = await this.createMultiCompiler(context, config);

    return new WebpackBundler(compiler);
  }

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

  async build(context: BuildContext, config: any) {
    const compiler = await this.createMultiCompiler(context, config);
    compiler.run((err, stats) => {
      console.log(err, stats);
    });
  }

  getWebpackConfig(context: BundlerContext, config: any) {
    return merge(this.createConfig(context.entry, this.workspace.path), config);
  }

  private async createMultiCompiler(context: BuildContext, config: any): Promise<MultiCompiler> {
    const extensionEntries = await this.bundler.computeEntries(context);

    const entries = context.capsuleGraph.capsules.map(({ capsule }) => {
      const main = capsule.component.config.main;
      return {
        path: capsule.path,
        entries: [join(capsule.wrkDir, main)].concat(extensionEntries),
      };
    });

    const configs = entries.map((entry) => {
      const webpackConf = merge(previewConfigFactory(entry.entries, entry.path), config);
      return webpackConf;
    });

    return webpack(configs);
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
