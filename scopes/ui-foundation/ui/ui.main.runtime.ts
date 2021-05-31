import type { AspectMain } from '@teambit/aspect';
import { ComponentType } from 'react';
import { AspectDefinition } from '@teambit/aspect-loader';
import { CacheAspect, CacheMain } from '@teambit/cache';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import chalk from 'chalk';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import PubsubAspect, { PubsubMain } from '@teambit/pubsub';
import { sha1 } from '@teambit/legacy/dist/utils';
import fs from 'fs-extra';
import getPort from 'get-port';
import { join, resolve } from 'path';
import { promisify } from 'util';
import webpack from 'webpack';
import { UiServerStartedEvent } from './events';
import { createRoot } from './create-root';
import { UnknownUI, UnknownBuildError } from './exceptions';
import { StartCmd } from './start.cmd';
import { UIBuildCmd } from './ui-build.cmd';
import { UIRoot } from './ui-root';
import { UIServer } from './ui-server';
import { UIAspect, UIRuntime } from './ui.aspect';
import { OpenBrowser } from './open-browser';
import createWebpackConfig from './webpack/webpack.browser.config';
import createSsrWebpackConfig from './webpack/webpack.ssr.config';
import { StartPlugin, StartPluginOptions } from './start-plugin';

export type UIDeps = [PubsubMain, CLIMain, GraphqlMain, ExpressMain, ComponentMain, CacheMain, LoggerMain, AspectMain];

export type UIRootRegistry = SlotRegistry<UIRoot>;

export type OnStart = () => Promise<undefined | ComponentType<{}>>;

export type StartPluginSlot = SlotRegistry<StartPlugin>;

export type PublicDirOverwrite = (uiRoot: UIRoot) => Promise<string | undefined>;

export type BuildMethodOverwrite = (name: string, uiRoot: UIRoot, rebuild?: boolean) => Promise<string>;

export type OnStartSlot = SlotRegistry<OnStart>;

export type PublicDirOverwriteSlot = SlotRegistry<PublicDirOverwrite>;

export type BuildMethodOverwriteSlot = SlotRegistry<BuildMethodOverwrite>;

export type UIConfig = {
  /**
   * port for the UI root to use.
   */
  port?: number;

  /**
   * port range for the UI root to use.
   */
  portRange: [number, number];

  /**
   * host for the UI root
   */
  host: string;

  /**
   * directory in workspace to use for public assets.
   * always relative to the workspace root directory.
   */
  publicDir: string;
};

export type RuntimeOptions = {
  /**
   * determine whether to initiate on verbose mode.
   */
  verbose?: boolean;

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

  /**
   * determine whether to rebuild the UI before start.
   */
  rebuild?: boolean;
};

export class UiMain {
  constructor(
    /**
     * Pubsub extension.
     */
    private pubsub: PubsubMain,

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
     * Overwrite the public dir Slot
     */
    private publicDirOverwriteSlot: PublicDirOverwriteSlot,

    /**
     * Overwrite the build ui method
     */
    private buildMethodOverwriteSlot: BuildMethodOverwriteSlot,

    /**
     * component extension.
     */
    private componentExtension: ComponentMain,

    /**
     * ui logger instance.
     */
    private cache: CacheMain,

    /**
     * ui logger instance.
     */
    private logger: Logger,

    private harmony: Harmony,

    private startPluginSlot: StartPluginSlot
  ) {}

  async publicDir(uiRoot: UIRoot) {
    const overwriteFn = this.getOverwritePublic();
    if (overwriteFn) {
      const hasDir = await overwriteFn(uiRoot);
      if (hasDir) return hasDir;
    }

    if (this.config.publicDir.startsWith('/')) {
      return this.config.publicDir.substring(1);
    }

    return this.config.publicDir;
  }

  getUiByName(name = '') {
    const roots = this.uiRootSlot.toArray();
    return roots.find(([, uiRoot]) => {
      return uiRoot.name === name;
    });
  }

  /**
   * create a build of the given UI root.
   */
  async build(uiRootName?: string): Promise<webpack.MultiStats | undefined> {
    // TODO: change to MultiStats from webpack once they export it in their types
    this.logger.debug(`build, uiRootName: "${uiRootName}"`);
    const maybeUiRoot = this.getUi(uiRootName) || this.getUiByName(uiRootName);

    if (!maybeUiRoot) throw new UnknownUI(uiRootName || '');
    const [name, uiRoot] = maybeUiRoot;

    // TODO: @uri refactor all dev server related code to use the bundler extension instead.
    const ssr = uiRoot.buildOptions?.ssr || false;
    const mainEntry = await this.generateRoot(await uiRoot.resolveAspects(UIRuntime.name), name);

    const browserConfig = createWebpackConfig(uiRoot.path, [mainEntry], uiRoot.name, await this.publicDir(uiRoot));
    const ssrConfig = ssr && createSsrWebpackConfig(uiRoot.path, [mainEntry], await this.publicDir(uiRoot));

    const config = [browserConfig, ssrConfig].filter((x) => !!x) as webpack.Configuration[];
    const compiler = webpack(config);
    this.logger.debug(`build, uiRootName: "${uiRootName}" running webpack`);
    const compilerRun = promisify(compiler.run.bind(compiler));
    const results = await compilerRun();
    this.logger.debug(`build, uiRootName: "${uiRootName}" completed webpack`);
    if (!results) throw new UnknownBuildError();
    if (results?.hasErrors()) {
      this.clearConsole();
      throw new Error(results?.toString());
    }

    return results;
  }

  registerStartPlugin(startPlugin: StartPlugin) {
    this.startPluginSlot.register(startPlugin);
    return this;
  }

  private async initiatePlugins(options: StartPluginOptions) {
    const plugins = this.startPluginSlot.values();
    await Promise.all(plugins.map((plugin) => plugin.initiate(options)));
    return plugins;
  }

  /**
   * create a Bit UI runtime.
   */
  async createRuntime({ uiRootName, pattern, dev, port, rebuild, verbose }: RuntimeOptions) {
    const maybeUiRoot = this.getUi(uiRootName) || this.getUiByName(uiRootName);

    if (!maybeUiRoot) throw new UnknownUI(uiRootName || '');
    const [name, uiRoot] = maybeUiRoot;

    const plugins = await this.initiatePlugins({
      verbose,
      pattern,
    });

    if (this.componentExtension.isHost(name)) this.componentExtension.setHostPriority(name);
    const uiServer = UIServer.create({
      express: this.express,
      graphql: this.graphql,
      uiRoot,
      uiRootExtension: name,
      ui: this,
      logger: this.logger,
      publicDir: await this.publicDir(uiRoot),
      startPlugins: plugins,
    });

    const targetPort = await this.getPort(port);

    if (dev) {
      await uiServer.dev({ port: targetPort });
    } else {
      await this.buildUI(name, uiRoot, rebuild);
      await uiServer.start({ port: targetPort });
    }

    this.pubsub.pub(UIAspect.id, this.createUiServerStartedEvent(this.config.host, targetPort, uiRoot));

    return uiServer;
  }

  async getPort(port?: number): Promise<number> {
    if (port) return port;
    return this.config.port || this.selectPort();
  }

  /**
   * Events
   */
  private createUiServerStartedEvent = (targetHost, targetPort, uiRoot) => {
    return new UiServerStartedEvent(Date.now(), targetHost, targetPort, uiRoot);
  };

  /**
   * bind to ui server start event.
   */
  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  /**
   * overwrite the build ui function
   */
  registerBuildUIOverwrite(fn: BuildMethodOverwrite) {
    this.buildMethodOverwriteSlot.register(fn);
    return this;
  }

  /**
   * overwrite the build ui function
   */
  registerPublicDirOverwrite(fn: PublicDirOverwrite) {
    this.publicDirOverwriteSlot.register(fn);
    return this;
  }

  private getOverwriteBuildFn() {
    const buildMethodOverwrite = this.buildMethodOverwriteSlot.toArray();
    if (buildMethodOverwrite[0]) {
      const [, fn] = buildMethodOverwrite[0];
      return fn;
    }
    return undefined;
  }

  private getOverwritePublic() {
    const overwritePublic = this.publicDirOverwriteSlot.toArray();
    if (overwritePublic[0]) {
      const [, fn] = overwritePublic[0];
      return fn;
    }
    return undefined;
  }

  async invokeOnStart(): Promise<ComponentType[]> {
    const promises = this.onStartSlot.values().map((fn) => fn());
    const startPlugins = await Promise.all(promises);
    return startPlugins.filter((plugin) => !!plugin) as ComponentType[];
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
  getUi(uiRootName?: string): [string, UIRoot] | undefined {
    if (uiRootName) {
      const root = this.getUiRootOrThrow(uiRootName, false);
      if (!root) return undefined;
      return [uiRootName, root];
    }
    const uis = this.uiRootSlot.toArray();
    if (uis.length === 1) return uis[0];
    return uis.find(([, root]) => root.priority);
  }

  getUiRootOrThrow(uiRootName: string, shouldThrow: boolean): UIRoot | undefined {
    const uiSlot = this.uiRootSlot.get(uiRootName);
    if (!uiSlot && shouldThrow)
      throw new UnknownUI(
        uiRootName,
        this.uiRootSlot.toArray().map(([id]) => id)
      );
    return uiSlot;
  }

  createLink(aspectDefs: AspectDefinition[], rootExtensionName: string) {
    return createRoot(aspectDefs, rootExtensionName);
  }

  /**
   * generate the root file of the UI runtime.
   */
  async generateRoot(
    aspectDefs: AspectDefinition[],
    rootExtensionName: string,
    runtimeName = UIRuntime.name,
    rootAspect = UIAspect.id
  ) {
    const contents = await createRoot(
      aspectDefs,
      rootExtensionName,
      rootAspect,
      runtimeName,
      this.harmony.config.toObject()
    );
    const filepath = resolve(join(__dirname, `${runtimeName}.root${sha1(contents)}.js`));
    if (fs.existsSync(filepath)) return filepath;
    fs.outputFileSync(filepath, contents);
    return filepath;
  }

  private async selectPort() {
    const [from, to] = this.config.portRange;
    return getPort({ port: getPort.makeRange(from, to) });
  }

  private async buildUI(name: string, uiRoot: UIRoot, rebuild?: boolean): Promise<string> {
    this.logger.debug(`buildUI, name ${name}`);
    const overwrite = this.getOverwriteBuildFn();
    if (overwrite) return overwrite(name, uiRoot, rebuild);
    const hash = await this.buildIfChanged(name, uiRoot, rebuild);
    await this.buildIfNoBundle(name, uiRoot);
    return hash;
  }

  async buildUiHash(uiRoot: UIRoot, runtime = 'ui'): Promise<string> {
    const aspects = await uiRoot.resolveAspects(runtime);
    aspects.sort((a, b) => (a.aspectPath > b.aspectPath ? 1 : -1));
    const hash = aspects.map((aspect) => {
      return [aspect.aspectPath, aspect.runtimePath].join('');
    });
    return sha1(hash.join(''));
  }

  async buildIfChanged(name: string, uiRoot: UIRoot, force: boolean | undefined): Promise<string> {
    this.logger.debug(`buildIfChanged, name ${name}`);
    const hash = await this.buildUiHash(uiRoot);
    const hashed = await this.cache.get(uiRoot.path);
    if (hash === hashed && !force) {
      this.logger.debug(`buildIfChanged, name ${name}, returned from cache`);
      return hash;
    }
    if (hash !== hashed) {
      this.logger.console(
        `${uiRoot.configFile} has been changed. Rebuilding UI assets for '${chalk.cyan(
          uiRoot.name
        )} in target directory: ${chalk.cyan(await this.publicDir(uiRoot))}'`
      );
    } else {
      this.logger.console(
        `Building UI assets for '${chalk.cyan(uiRoot.name)}' in target directory: ${chalk.cyan(
          await this.publicDir(uiRoot)
        )}`
      );
    }

    await this.build(name);
    await this.cache.set(uiRoot.path, hash);
    return hash;
  }

  clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async buildIfNoBundle(name: string, uiRoot: UIRoot) {
    const config = createWebpackConfig(
      uiRoot.path,
      [await this.generateRoot(await uiRoot.resolveAspects(UIRuntime.name), name)],
      uiRoot.name,
      await this.publicDir(uiRoot)
    );
    if (config.output?.path && fs.pathExistsSync(config.output.path)) return;
    const hash = await this.buildUiHash(uiRoot);
    await this.build(name);
    await this.cache.set(uiRoot.path, hash);
  }

  private async openBrowser(url: string) {
    const openBrowser = new OpenBrowser(this.logger);
    openBrowser.open(url);
  }

  static defaultConfig = {
    publicDir: 'public/bit',
    portRange: [3000, 3100],
    host: 'localhost',
  };

  static runtime = MainRuntime;
  static dependencies = [
    PubsubAspect,
    CLIAspect,
    GraphqlAspect,
    ExpressAspect,
    ComponentAspect,
    CacheAspect,
    LoggerAspect,
  ];

  static slots = [
    Slot.withType<UIRoot>(),
    Slot.withType<OnStart>(),
    Slot.withType<PublicDirOverwriteSlot>(),
    Slot.withType<BuildMethodOverwriteSlot>(),
    Slot.withType<StartPlugin>(),
  ];

  static async provider(
    [pubsub, cli, graphql, express, componentExtension, cache, loggerMain]: UIDeps,
    config,
    [uiRootSlot, onStartSlot, publicDirOverwriteSlot, buildMethodOverwriteSlot, proxyGetterSlot]: [
      UIRootRegistry,
      OnStartSlot,
      PublicDirOverwriteSlot,
      BuildMethodOverwriteSlot,
      StartPluginSlot
    ],
    harmony: Harmony
  ) {
    // aspectExtension.registerRuntime(new RuntimeDefinition('ui', []))
    const logger = loggerMain.createLogger(UIAspect.id);

    const ui = new UiMain(
      pubsub,
      config,
      graphql,
      uiRootSlot,
      express,
      onStartSlot,
      publicDirOverwriteSlot,
      buildMethodOverwriteSlot,
      componentExtension,
      cache,
      logger,
      harmony,
      proxyGetterSlot
    );
    cli.register(new StartCmd(ui, logger), new UIBuildCmd(ui));
    return ui;
  }
}

UIAspect.addRuntime(UiMain);
