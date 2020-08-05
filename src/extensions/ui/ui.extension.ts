import { join, resolve } from 'path';
import { promisify } from 'util';
import { Slot, SlotRegistry } from '@teambit/harmony';
import getPort from 'get-port';
import fs from 'fs-extra';
import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';
import { CLIExtension } from '../cli';
import { StartCmd } from './start.cmd';
import { GraphQLExtension } from '../graphql';
import { devConfig } from './webpack/webpack.dev.config';
import createWebpackConfig from './webpack/webpack.config';
import { UIRoot } from './ui-root';
import { UnknownUI } from './exceptions';
import { createRoot } from './create-root';
import { sha1 } from '../../utils';
import { ExpressExtension } from '../express';
import { ComponentExtension } from '../component';
import { UIBuildCmd } from './ui-build.cmd';

export type UIDeps = [CLIExtension, GraphQLExtension, ExpressExtension, ComponentExtension];

export type UIRootRegistry = SlotRegistry<UIRoot>;

export type OnStart = () => void;

export type OnStartSlot = SlotRegistry<OnStart>;

export class UIExtension {
  constructor(
    /**
     * graphql extension.
     */
    private graphql: GraphQLExtension,

    /**
     * slot registry of ui roots.
     */
    private uiRootSlot: UIRootRegistry,

    /**
     * express extension.
     */
    private express: ExpressExtension,

    /**
     * on start slot
     */
    private onStartSlot: OnStartSlot,

    /**
     * component extension.
     */
    private componentExtension: ComponentExtension
  ) {}

  static runtimes = {
    ui: '',
    cli: '',
  };

  private async selectPort() {
    return getPort({ port: getPort.makeRange(3000, 3200) });
  }

  /**
   * create a build of the given UI root.
   */
  async build(uiRootName?: string) {
    const [name, uiRoot] = this.getUi(uiRootName);
    // TODO: @uri refactor all dev server related code to use the bundler extension instead.
    const config = createWebpackConfig(
      uiRoot.path,
      [await this.generateRoot(uiRoot.extensionsPaths, name)],
      uiRootName
    );

    const compiler = webpack(config);
    const compilerRun = promisify(compiler.run.bind(compiler));
    return compilerRun();
  }

  async createRuntime(uiRootName?: string, pattern?: string) {
    const [name, uiRoot] = this.getUi(uiRootName);
    this.componentExtension.setHostPriority(name);
    const server = this.graphql.listen();
    this.express.listen();
    // TODO: @uri refactor all dev server related code to use the bundler extension instead.
    const config = devConfig(uiRoot.path, [await this.generateRoot(uiRoot.extensionsPaths, name)], uiRootName);
    const compiler = webpack(config);
    const devServer = new WebpackDevServer(compiler, config.devServer);
    devServer.listen(await this.selectPort());
    if (uiRoot.postStart) uiRoot.postStart({ pattern }, uiRoot);
    await this.invokeOnStart();
    return server;
  }

  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  private async invokeOnStart(): Promise<void> {
    const promises = this.onStartSlot.values().map((fn) => fn());
    await Promise.all(promises);
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

  getUi(uiRootName?: string): [string, UIRoot] {
    if (uiRootName) {
      const root = this.getUiRootOrThrow(uiRootName);
      return [uiRootName, root];
    }
    const uis = this.uiRootSlot.toArray();
    if (uis.length === 1) return uis[0];
    const uiRoot = uis.find(([, root]) => root.priority);
    if (!uiRoot) throw new UnknownUI('default');
    return uiRoot;
  }

  getUiRootOrThrow(uiRootName: string): UIRoot {
    const uiSlot = this.uiRootSlot.get(uiRootName);
    if (!uiSlot) throw new UnknownUI(uiRootName);
    return uiSlot;
  }

  static dependencies = [CLIExtension, GraphQLExtension, ExpressExtension, ComponentExtension];

  static slots = [Slot.withType<UIRoot>(), Slot.withType<OnStart>()];

  static async provider(
    [cli, graphql, express, componentExtension]: UIDeps,
    config,
    [uiRootSlot, onStartSlot]: [UIRootRegistry, OnStartSlot]
  ) {
    const ui = new UIExtension(graphql, uiRootSlot, express, onStartSlot, componentExtension);
    cli.register(new StartCmd(ui));
    cli.register(new UIBuildCmd(ui));
    return ui;
  }
}
