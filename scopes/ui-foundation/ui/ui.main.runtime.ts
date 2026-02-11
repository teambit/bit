import { existsSync, readFileSync } from 'fs';
import type { ComponentType } from 'react';
import type { AspectMain } from '@teambit/aspect';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { getAspectDirFromBvm } from '@teambit/aspect-loader';
import type { CacheMain } from '@teambit/cache';
import { CacheAspect } from '@teambit/cache';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { ExpressMain } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import chalk from 'chalk';
import type { SlotRegistry, Harmony } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { PubsubMain } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import pMapSeries from 'p-map-series';
import fs from 'fs-extra';
import { Port } from '@teambit/toolbox.network.get-port';
import { createRoot } from '@teambit/harmony.modules.harmony-root-generator';
import { join, resolve as pathResolve } from 'path';
import { rspack } from '@rspack/core';
import { UiServerStartedEvent } from './events';
import { UnknownUI, UnknownBuildError } from './exceptions';
import { StartCmd } from './start.cmd';
import { UIBuildCmd } from './ui-build.cmd';
import type { UIRoot } from './ui-root';
import { UIServer } from './ui-server';
import { UIAspect, UIRuntime } from './ui.aspect';
import createRspackBrowserConfig from './rspack/rspack.browser.config';
import createRspackSsrConfig from './rspack/rspack.ssr.config';
import type { StartPlugin, StartPluginOptions } from './start-plugin';
import { BundleUiTask, BUNDLE_UI_HASH_FILENAME } from './bundle-ui.task';

export type UIDeps = [PubsubMain, CLIMain, GraphqlMain, ExpressMain, ComponentMain, CacheMain, LoggerMain, AspectMain];

export type UIRootRegistry = SlotRegistry<UIRoot>;

export type PreStart = (preStartOpts: PreStartOpts) => Promise<void>;

export type PreStartOpts = { skipCompilation?: boolean };

export type OnStart = () => Promise<undefined | ComponentType<{}>>;

export type StartPluginSlot = SlotRegistry<StartPlugin>;

export type PublicDirOverwrite = (uiRoot: UIRoot) => Promise<string | undefined>;

export type BuildMethodOverwrite = (name: string, uiRoot: UIRoot, rebuild?: boolean) => Promise<string>;

export type PreStartSlot = SlotRegistry<PreStart>;

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

  /** the url to display when server is listening. Note that bit does not provide proxying to this url */
  publicUrl?: string;
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
  uiRootAspectIdOrName?: string;

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

  /**
   * skip build the UI before start
   */
  skipUiBuild?: boolean;

  /**
   * Show the internal urls of the dev servers
   */
  showInternalUrls?: boolean;
};

export class UiMain {
  private _isBundleUiServed = false;
  private currentUIServer: UIServer | undefined;

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
     * pre-start slot
     */
    private preStartSlot: PreStartSlot,

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

  private getUiByName(name: string) {
    const roots = this.uiRootSlot.toArray();
    const [, root] =
      roots.find(([, uiRoot]) => {
        return uiRoot.name === name;
      }) || [];

    return root;
  }

  /**
   * create a build of the given UI root.
   */
  async build(uiRootAspectIdOrName?: string, customOutputPath?: string): Promise<any> {
    this.logger.debug(`build, uiRootAspectIdOrName: "${uiRootAspectIdOrName}"`);
    const maybeUiRoot = this.getUi(uiRootAspectIdOrName);

    if (!maybeUiRoot) throw new UnknownUI(uiRootAspectIdOrName, this.possibleUis());
    const [uiRootAspectId, uiRoot] = maybeUiRoot;

    // TODO: @uri refactor all dev server related code to use the bundler extension instead.
    const ssr = uiRoot.buildOptions?.ssr || false;
    const mainEntry = await this.generateRoot(await uiRoot.resolveAspects(UIRuntime.name), uiRootAspectId);
    const outputPath = customOutputPath || uiRoot.path;
    const publicDir = await this.publicDir(uiRoot);

    const browserConfig = createRspackBrowserConfig(outputPath, [mainEntry], uiRoot.name, publicDir);
    const compiler = rspack(browserConfig as any);
    this.logger.debug(`rspack (build): running for browser`);
    const [results, errors] = await this.runRspackPromise(compiler);
    this.logger.debug(`rspack (build): completed browser`);
    if (!results) throw new UnknownBuildError();
    if (errors) {
      this.clearConsole();
      throw new Error(errors);
    }
    if (results?.hasErrors()) {
      this.clearConsole();
      throw new Error(results?.toString());
    }

    if (ssr) {
      const ssrConfig = createRspackSsrConfig(outputPath, [mainEntry], publicDir);
      const ssrCompiler = rspack(ssrConfig as any);
      this.logger.debug(`rspack (build): running for SSR`);
      const [ssrResults, ssrErrors] = await this.runRspackPromise(ssrCompiler);
      this.logger.debug(`rspack (build): completed SSR build`);
      if (ssrErrors) {
        this.clearConsole();
        throw new Error(ssrErrors);
      }
      if (ssrResults?.hasErrors()) {
        this.clearConsole();
        throw new Error(ssrResults?.toString());
      }
    }

    return results;
  }

  registerStartPlugin(startPlugin: StartPlugin) {
    this.startPluginSlot.register(startPlugin);
    return this;
  }

  private async runRspackPromise(compiler: any): Promise<[any | undefined, string | undefined]> {
    return new Promise((resolve) =>
      compiler.run((err, stats) => {
        if (err) {
          this.logger.error('get error from rspack compiler, when bundling ui server, full error:', err);
          return resolve([undefined, `${err.toString()}\n${err.stack}`]);
        }
        return resolve([stats, undefined]);
      })
    );
  }

  private async initiatePlugins(options: StartPluginOptions) {
    const plugins = this.startPluginSlot.values();
    await pMapSeries(plugins, (plugin) => plugin.initiate(options));
    return plugins;
  }

  runtimeOptions: RuntimeOptions = {};

  getUIServer(): UIServer | undefined {
    return this.currentUIServer;
  }
  /**
   * create a Bit UI runtime.
   */
  async createRuntime(runtimeOptions: RuntimeOptions) {
    this.runtimeOptions = runtimeOptions;
    const { uiRootName, pattern, dev, port, rebuild, verbose, skipUiBuild, showInternalUrls } = this.runtimeOptions;
    // uiRootName to be deprecated
    const uiRootAspectIdOrName = uiRootName || runtimeOptions.uiRootAspectIdOrName;
    const maybeUiRoot = this.getUi(uiRootAspectIdOrName);
    if (!maybeUiRoot) throw new UnknownUI(uiRootAspectIdOrName, this.possibleUis());

    const [uiRootAspectId, uiRoot] = maybeUiRoot;

    const plugins = await this.initiatePlugins({
      verbose,
      pattern,
      showInternalUrls,
    });

    if (this.componentExtension.isHost(uiRootAspectId)) this.componentExtension.setHostPriority(uiRootAspectId);

    const publicDir = await this.publicDir(uiRoot);
    const uiServer = UIServer.create({
      express: this.express,
      graphql: this.graphql,
      uiRoot,
      uiRootExtension: uiRootAspectId,
      ui: this,
      logger: this.logger,
      publicDir,
      startPlugins: plugins,
    });

    this.currentUIServer = uiServer;

    // Adding signal listeners to make sure we immediately close the process on sigint / sigterm (otherwise webpack dev server closing will take time)
    this.addSignalListener();
    if (dev) {
      await uiServer.dev({ portRange: port || this.config.portRange });
    } else {
      if (!skipUiBuild) await this.buildUI(uiRootAspectId, uiRoot, rebuild);
      const bundleUiPath = this.getBundleUiPath(uiRootAspectId);
      const bundleUiPublicPath = bundleUiPath ? join(bundleUiPath, publicDir) : undefined;
      const bundleUiRoot =
        this._isBundleUiServed && bundleUiPublicPath && existsSync(bundleUiPublicPath || '')
          ? bundleUiPublicPath
          : undefined;
      if (bundleUiRoot)
        this.logger.debug(`UI createRuntime of ${uiRootAspectId}, bundle will be served from ${bundleUiRoot}`);
      await uiServer.start({ portRange: port || this.config.portRange, bundleUiRoot });
    }

    this.pubsub.pub(UIAspect.id, this.createUiServerStartedEvent(this.config.host, uiServer.port, uiRoot));

    return uiServer;
  }

  private addSignalListener() {
    process.on('SIGTERM', () => {
      process.exit();
    });

    process.on('SIGINT', () => {
      process.exit();
    });
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
   * pre-start events are triggered and *completed* before the webserver started.
   * (the promise is awaited)
   */
  registerPreStart(preStartFn: PreStart) {
    this.preStartSlot.register(preStartFn);
  }

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

  async invokePreStart(preStartOpts: PreStartOpts): Promise<void> {
    const onPreStartFuncs = this.preStartSlot.values();
    await pMapSeries(onPreStartFuncs, async (fn) => fn(preStartOpts));
  }

  async invokeOnStart(): Promise<ComponentType[]> {
    const onStartFuncs = this.onStartSlot.values();
    const startPlugins = await pMapSeries(onStartFuncs, async (fn) => fn());
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
  getUi(uiRootAspectIdOrName?: string): [string, UIRoot] | undefined {
    if (uiRootAspectIdOrName) {
      const root = this.uiRootSlot.get(uiRootAspectIdOrName) || this.getUiByName(uiRootAspectIdOrName);
      if (!root) return undefined;
      return [uiRootAspectIdOrName, root];
    }
    const uis = this.uiRootSlot.toArray();
    if (uis.length === 1) return uis[0];
    return uis.find(([, root]) => root.priority);
  }

  isHostAvailable(): boolean {
    return Boolean(this.componentExtension.getHost());
  }

  getUiName(uiRootAspectIdOrName?: string): string | undefined {
    const [, ui] = this.getUi(uiRootAspectIdOrName) || [];
    if (!ui) return undefined;

    return ui.name;
  }

  private possibleUis() {
    return this.uiRootSlot.toArray().map(([id]) => id);
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
    rootAspect = UIAspect.id,
    config?: object,
    path?: string,
    ignoreVersion?: boolean,
    addRuntimes?: boolean,
    harmonyPackage?: string,
    shouldRun = false
  ) {
    const contents = await createRoot(
      aspectDefs,
      rootExtensionName,
      rootAspect,
      runtimeName,
      config || this.harmony.config.toObject(),
      ignoreVersion,
      addRuntimes,
      harmonyPackage,
      shouldRun
    );
    const filepath = pathResolve(join(path || __dirname, `${runtimeName}.root${sha1(contents)}.js`));
    if (fs.existsSync(filepath)) return filepath;
    fs.outputFileSync(filepath, contents);
    return filepath;
  }

  private async selectPort() {
    const [from, to] = this.config.portRange;
    const usedPorts = (await this.cache.get<number[]>(`${from}${to}`)) || [];
    const port = await Port.getPort(from, to, usedPorts);
    // this will lock the port for 1 min to avoid race conditions
    await this.cache.set(`${from}${to}`, usedPorts.concat(port), 5000);
    return port;
  }

  private async buildUI(uiRootAspectId: string, uiRoot: UIRoot, rebuild?: boolean): Promise<string> {
    this.logger.debug(`buildUI, uiRootAspectId ${uiRootAspectId}`);

    const overwrite = this.getOverwriteBuildFn();
    if (overwrite) return overwrite(uiRootAspectId, uiRoot, rebuild);

    this._isBundleUiServed = await this.shouldServeBundleUi(uiRootAspectId, uiRoot, rebuild);
    await this.buildIfChanged(uiRootAspectId, uiRoot, rebuild);
    await this.buildIfNoBundle(uiRootAspectId, uiRoot);
    return '';
  }

  private async shouldServeBundleUi(
    uiRootAspectId: string,
    uiRoot: UIRoot,
    force: boolean | undefined
  ): Promise<boolean> {
    if (!uiRoot.buildOptions?.prebundle) {
      return false;
    }

    const currentBundleUiHash = await this.createBundleUiHash(uiRoot);
    const cachedBundleUiHash = this.readBundleUiHash(uiRootAspectId);
    const isLocalBuildAvailable = existsSync(join(uiRoot.path, await this.publicDir(uiRoot)));

    return currentBundleUiHash === cachedBundleUiHash && !isLocalBuildAvailable && !force;
  }

  async buildIfChanged(uiRootAspectId: string, uiRoot: UIRoot, force: boolean | undefined): Promise<boolean> {
    this.logger.debug(`buildIfChanged, uiRootAspectId ${uiRootAspectId}`);

    if (this._isBundleUiServed) {
      this.logger.debug(`buildIfChanged, uiRootAspectId ${uiRootAspectId}, returned from ui bundle cache`);
      return false;
    }

    const currentBuildUiHash = await this.createBuildUiHash(uiRoot);
    const cachedBuildUiHash = await this.cache.get(uiRoot.path);
    if (currentBuildUiHash === cachedBuildUiHash && !force) {
      this.logger.debug(`buildIfChanged, uiRootAspectId ${uiRootAspectId}, returned from ui build cache`);
      return false;
    }

    if (!cachedBuildUiHash) {
      this.logger.console(
        `${chalk.magenta('[Rspack]')} Building UI assets for '${chalk.cyan(uiRoot.name)}' in target directory: ${chalk.cyan(
          await this.publicDir(uiRoot)
        )}. The first time we build the UI it may take a few minutes.`
      );
    } else {
      this.logger.console(
        `${chalk.magenta('[Rspack]')} Rebuilding UI assets for '${chalk.cyan(uiRoot.name)}' in target directory: ${chalk.cyan(
          await this.publicDir(uiRoot)
        )}' as ${uiRoot.configFile} has been changed.`
      );
    }

    await this.build(uiRootAspectId);
    await this.cache.set(uiRoot.path, currentBuildUiHash);
    return true;
  }

  private async createBuildUiHash(uiRoot: UIRoot, runtime = 'ui'): Promise<string> {
    const aspects = await uiRoot.resolveAspects(runtime);
    aspects.sort((a, b) => (a.aspectPath > b.aspectPath ? 1 : -1));
    const aspectPathStrings = aspects.map((aspect) => {
      return [aspect.aspectPath, aspect.runtimePath].join('');
    });
    return sha1(aspectPathStrings.join(''));
  }

  /**
   * Generate hash for a given root
   * This API is public and used by external users, do not rename this function
   */
  async buildUiHash(uiRoot: UIRoot, runtime = 'ui'): Promise<string> {
    return this.createBuildUiHash(uiRoot, runtime);
  }

  async createBundleUiHash(uiRoot: UIRoot, runtime = 'ui'): Promise<string> {
    const aspects = await uiRoot.resolveAspects(runtime);
    aspects.sort((a, b) => ((a.getId || a.aspectPath) > (b.getId || b.aspectPath) ? 1 : -1));
    const aspectIds = aspects.map((aspect) => aspect.getId || aspect.aspectPath);
    return sha1(aspectIds.join(''));
  }

  private readBundleUiHash(uiRootAspectId: string) {
    const bundleUiPathFromBvm = this.getBundleUiPath(uiRootAspectId);
    if (!bundleUiPathFromBvm) {
      return '';
    }
    const hashFilePath = join(bundleUiPathFromBvm, BUNDLE_UI_HASH_FILENAME);
    if (existsSync(hashFilePath)) {
      return readFileSync(hashFilePath).toString();
    }
    return '';
  }

  private getBundleUiPath(uiRootAspectId: string): string | undefined {
    try {
      const uiPathFromBvm = getAspectDirFromBvm(UIAspect.id);
      return join(uiPathFromBvm, BundleUiTask.getArtifactDirectory(uiRootAspectId));
    } catch (err) {
      this.logger.error(`getBundleUiPath, getAspectDirFromBvm failed with err: ${err}`);
      return undefined;
    }
  }

  private async buildIfNoBundle(uiRootAspectId: string, uiRoot: UIRoot): Promise<boolean> {
    if (this._isBundleUiServed) return false;

    const config = createRspackBrowserConfig(
      uiRoot.path,
      [await this.generateRoot(await uiRoot.resolveAspects(UIRuntime.name), uiRootAspectId)],
      uiRoot.name,
      await this.publicDir(uiRoot)
    );
    if (config.output?.path && fs.pathExistsSync(config.output.path as string)) return false;
    const hash = await this.createBuildUiHash(uiRoot);
    await this.build(uiRootAspectId);
    await this.cache.set(uiRoot.path, hash);
    return true;
  }

  clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  get publicUrl() {
    return this.config.publicUrl;
  }

  static defaultConfig: UIConfig = {
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
    Slot.withType<PreStart>(),
    Slot.withType<OnStart>(),
    Slot.withType<PublicDirOverwriteSlot>(),
    Slot.withType<BuildMethodOverwriteSlot>(),
    Slot.withType<StartPlugin>(),
  ];

  static async provider(
    [pubsub, cli, graphql, express, componentExtension, cache, loggerMain]: UIDeps,
    config,
    [uiRootSlot, preStartSlot, onStartSlot, publicDirOverwriteSlot, buildMethodOverwriteSlot, proxyGetterSlot]: [
      UIRootRegistry,
      PreStartSlot,
      OnStartSlot,
      PublicDirOverwriteSlot,
      BuildMethodOverwriteSlot,
      StartPluginSlot,
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
      preStartSlot,
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
