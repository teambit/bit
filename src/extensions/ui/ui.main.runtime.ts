import { join, resolve } from 'path';
import { promisify } from 'util';
import { Slot, SlotRegistry } from '@teambit/harmony';
import getPort from 'get-port';
import fs from 'fs-extra';
import webpack from 'webpack';
import { UIAspect } from './ui.aspect';
import { MainRuntime, CLIAspect } from '../cli/cli.aspect';
import { CLIMain } from '../cli';
import { StartCmd } from './start.cmd';
import { GraphqlAspect } from '../graphql';
import type { GraphqlMain } from '../graphql';
import createWebpackConfig from './webpack/webpack.config';
import { UIRoot } from './ui-root';
import { UnknownUI } from './exceptions';
import { createRoot } from './create-root';
import { sha1 } from '../../utils';
import { ExpressMain, ExpressAspect } from '../express';
import type { ComponentMain } from '../component';
import { ComponentAspect } from '../component';
import { UIBuildCmd } from './ui-build.cmd';
import { UIServer } from './ui-server';
import { Logger, LoggerMain, LoggerAspect } from '../logger';
import type { AspectMain } from '../aspect';

export type UIDeps = [CLIMain, GraphqlMain, ExpressMain, ComponentMain, LoggerMain, AspectMain];

export type UIRootRegistry = SlotRegistry<UIRoot>;

export type OnStart = () => void;

export type OnStartSlot = SlotRegistry<OnStart>;

export type UIConfig = {
  port?: number;
  portRange: [number, number];
};

export type RuntimeOptions = {
  /**
   * name of the UI root to load.
   */
  uiRootName?: string;

  /**
   * component selector pattern to load.
   */
  pattern?: string;

  /**
   * determine whether to start a dev server (defaults to false).
   */
  dev?: boolean;

  /**
   * port of the config.
   */
  port?: number;
};

export class UiMain {
  constructor(
    private config: UIConfig,

    /**
     * graphql extension.
     */
    private graphql: GraphqlMain,

    /**
     * slot registry of ui roots.
     */
    private uiRootSlot: UIRootRegistry,

    /**
     * express extension.
     */
    private express: ExpressMain,

    /**
     * on start slot
     */
    private onStartSlot: OnStartSlot,

    /**
     * component extension.
     */
    private componentExtension: ComponentMain,

    /**
     * ui logger instance.
     */
    private logger: Logger
  ) {}

  /**
   * create a build of the given UI root.
   */
  async build(uiRootName?: string) {
    const [name, uiRoot] = this.getUi(uiRootName);
    // TODO: @uri refactor all dev server related code to use the bundler extension instead.
    const config = createWebpackConfig(
      uiRoot.path,
      [await this.generateRoot(uiRoot.extensionsPaths, uiRoot.aspectPaths, name)],
      name
    );

    const compiler = webpack(config);
    const compilerRun = promisify(compiler.run.bind(compiler));
    return compilerRun();
  }

  /**
   * create a Bit UI runtime.
   */
  async createRuntime({ uiRootName, pattern, dev, port }: RuntimeOptions) {
    const [name, uiRoot] = this.getUi(uiRootName);
    this.componentExtension.setHostPriority(name);
    const uiServer = UIServer.create({
      express: this.express,
      graphql: this.graphql,
      uiRoot,
      uiRootExtension: name,
      ui: this,
      logger: this.logger,
    });

    const targetPort = await this.getPort(port);

    if (dev) {
      await uiServer.dev({ port: targetPort });
    } else {
      await uiServer.start({ port: targetPort });
    }

    if (uiRoot.postStart) uiRoot.postStart({ pattern });
    await this.invokeOnStart();

    return uiServer;
  }

  async getPort(port?: number): Promise<number> {
    if (port) return port;
    return this.config.port || this.selectPort();
  }

  /**
   * bind to ui server start event.
   */
  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  private async invokeOnStart(): Promise<void> {
    const promises = this.onStartSlot.values().map((fn) => fn());
    await Promise.all(promises);
  }

  /**
   * register a UI slot.
   */
  registerUiRoot(uiRoot: UIRoot) {
    return this.uiRootSlot.register(uiRoot);
  }

  /**
   * get a UI runtime instance.
   */
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

  /**
   * generate the root file of the UI runtime.
   */
  async generateRoot(extensionPaths: string[], aspectPaths: string[], rootExtensionName: string) {
    const contents = await createRoot(extensionPaths, aspectPaths, rootExtensionName);
    const filepath = resolve(join(__dirname, `ui.root${sha1(contents)}.js`));
    if (fs.existsSync(filepath)) return filepath;
    fs.outputFileSync(filepath, contents);
    return filepath;
  }

  private async selectPort() {
    const [from, to] = this.config.portRange;
    return getPort({ port: getPort.makeRange(from, to) });
  }

  static defaultConfig = {
    portRange: [3000, 3200],
  };

  static runtime = MainRuntime;
  static dependencies = [CLIAspect, GraphqlAspect, ExpressAspect, ComponentAspect, LoggerAspect];

  static slots = [Slot.withType<UIRoot>(), Slot.withType<OnStart>()];

  static async provider(
    [cli, graphql, express, componentExtension, loggerMain]: UIDeps,
    config,
    [uiRootSlot, onStartSlot]: [UIRootRegistry, OnStartSlot]
  ) {
    // aspectExtension.registerRuntime(new RuntimeDefinition('ui', []))
    const logger = loggerMain.createLogger(UIAspect.id);
    const ui = new UiMain(config, graphql, uiRootSlot, express, onStartSlot, componentExtension, logger);
    cli.register(new StartCmd(ui));
    cli.register(new UIBuildCmd(ui));
    return ui;
  }
}

UIAspect.addRuntime(UiMain);
