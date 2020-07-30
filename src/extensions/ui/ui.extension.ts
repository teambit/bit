import { join, resolve } from 'path';
import { Slot, SlotRegistry } from '@teambit/harmony';
import getPort from 'get-port';
import fs from 'fs-extra';
import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';
import { CLIExtension } from '../cli';
import { StartCmd } from './start.cmd';
import { Environments } from '../environments';
import { GraphQLExtension } from '../graphql';
import { createWebpackConfig } from './webpack/webpack.config';
import { BundlerExtension } from '../bundler/bundler.extension';
import { UIRoot } from './ui-root';
import { UnknownUI } from './exceptions';
import { createRoot } from './create-root';
import { sha1 } from '../../utils';
import { ExpressExtension } from '../express';

export type UIDeps = [CLIExtension, Environments, GraphQLExtension, BundlerExtension, ExpressExtension];

export type UIRootRegistry = SlotRegistry<UIRoot>;

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
     * bundler extension.
     */
    private bundler: BundlerExtension,

    /**
     * slot registry of ui roots.
     */
    private uiRootSlot: UIRootRegistry,

    /**
     * express extension.
     */
    private express: ExpressExtension
  ) {}

  static runtimes = {
    ui: '',
    cli: '',
  };

  private async selectPort() {
    return getPort({ port: getPort.makeRange(3000, 3200) });
  }

  async createRuntime(uiRootName: string, pattern?: string) {
    const server = this.graphql.listen();
    this.express.listen();
    const uiRoot = this.getUiRootOrThrow(uiRootName);
    const config = createWebpackConfig(
      uiRoot.path,
      [await this.generateRoot(uiRoot.extensionsPaths, uiRootName)],
      uiRootName
    );
    const compiler = webpack(config);
    const devServer = new WebpackDevServer(compiler, config.devServer);
    devServer.listen(await this.selectPort());
    if (uiRoot.postStart) uiRoot.postStart({ pattern }, uiRoot);
    return server;
  }

  private async generateRoot(extensionPaths: string[], rootExtensionName: string) {
    const contents = await createRoot(extensionPaths, rootExtensionName);
    const filepath = resolve(join(__dirname, `ui.root${sha1(contents)}.js`));
    if (fs.existsSync(filepath)) return filepath;
    fs.outputFileSync(filepath, contents);
    return filepath;
  }

  /**
   * register a UI slot.
   */
  registerUiRoot(uiRoot: UIRoot) {
    return this.uiRootSlot.register(uiRoot);
  }

  getUiRootOrThrow(uiRootName: string): UIRoot {
    const uiSlot = this.uiRootSlot.get(uiRootName);
    if (!uiSlot) throw new UnknownUI(uiRootName);
    return uiSlot;
  }

  static dependencies = [CLIExtension, Environments, GraphQLExtension, BundlerExtension, ExpressExtension];

  static slots = [Slot.withType<UIRoot>()];

  static async provider([cli, envs, graphql, bundler, express]: UIDeps, config, [uiRootSlot]: [UIRootRegistry]) {
    const ui = new UIExtension(envs, graphql, bundler, uiRootSlot, express);
    cli.register(new StartCmd(ui));
    return ui;
  }
}
