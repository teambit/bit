import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';
import { CLIExtension } from '../cli';
import { StartCmd } from './start.cmd';
import { Environments } from '../environments';
import { Workspace, WorkspaceExt } from '../workspace';
import { GraphQLExtension } from '../graphql';
import { Component } from '../component';
import createWebpackConfig from './webpack/webpack.config';
import { BundlerExtension } from '../bundler/bundler.extension';

type UIDeps = [CLIExtension, Environments, Workspace, GraphQLExtension, BundlerExtension];
export class UIExtension {
  constructor(
    /**
     * envs extension.
     */
    private envs: Environments,

    /**
     * graphql extension.
     */
    private graphql: GraphQLExtension,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension.
     */
    private bundler: BundlerExtension
  ) {}

  static runtimes = {
    ui: '',
    cli: ''
  };

  private selectPort() {
    return 3000;
  }

  async createRuntime(components?: Component[]) {
    const server = this.graphql.listen();
    components;
    // const envRuntime = this.envs.createEnvironment(components || await this.workspace.list());
    // (await envRuntime).run()
    const config = createWebpackConfig(this.workspace.path, [require.resolve('./ui.runtime')]);
    const compiler = webpack(config);
    const devServer = new WebpackDevServer(compiler);
    devServer.listen(this.selectPort());
    return server;
  }

  static dependencies = [CLIExtension, Environments, WorkspaceExt, GraphQLExtension, BundlerExtension];

  static async provider([cli, envs, workspace, graphql, bundler]: UIDeps) {
    const ui = new UIExtension(envs, graphql, workspace, bundler);
    cli.register(new StartCmd(ui, workspace));
    return ui;
  }
}
